# OAuth V2 System — Complete Provider Workflow

> **Project:** api-gateway (Hono + Bun + Drizzle ORM + PostgreSQL + Zod)
> **Date Generated:** 2026-05-26
> **Covers:** MiniMax OAuth (device-code with PKCE) + Antigravity OAuth (Google authorization-code flow)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema (Drizzle ORM)](#2-database-schema)
3. [Types & Zod Validation](#3-types--zod-validation)
4. [Utility Layer](#4-utility-layer)
5. [Provider: MiniMax OAuth (Device-Code + PKCE)](#5-minimax-oauth)
6. [Provider: MiniMax Inference](#6-minimax-inference)
7. [Provider: Antigravity (Google Authorization-Code + PKCE)](#7-antigravity-oauth)
8. [API Routes (Hono)](#8-api-routes)
9. [Token Lifecycle & Storage](#9-token-lifecycle)
10. [Error Handling & Quarantine](#10-error-handling)
11. [Flow Diagrams](#11-flow-diagrams)
12. [Best Practices Checklist](#12-best-practices-checklist)

---

## 1. Architecture Overview

The system is an **API Gateway** that sits between clients and LLM inference providers. Some providers (like NVIDIA) use static API keys; others (like MiniMax) use **OAuth 2.0** with dynamic token acquisition and refresh.

```
Client (Web App)             API Gateway (Hono)              Provider (MiniMax)
      │                              │                              │
      │  POST /minimax/auth/init     │                              │
      │─────────────────────────────►│                              │
      │                              │  POST /oauth/code (PKCE)     │
      │                              │─────────────────────────────►│
      │                              │  user_code + verification_uri│
      │                              │◄─────────────────────────────│
      │  { user_code, verification_uri, session_id }                │
      │◄─────────────────────────────│                              │
      │                              │                              │
      │  (User opens browser,        │                              │
      │   enters code, approves)     │                              │
      │──────────────────────────────────────────────────────────►│
      │                              │                              │
      │  POST /minimax/auth/poll     │                              │
      │  { session_id, user_code }   │                              │
      │─────────────────────────────►│                              │
      │                              │  POST /oauth/token (poll)    │
      │                              │─────────────────────────────►│
      │                              │  access + refresh tokens     │
      │                              │◄─────────────────────────────│
      │  { status: "success", auth_state }                          │
      │◄─────────────────────────────│                              │
      │                              │                              │
      │  Client persists auth_state  │                              │
      │  (expo-secure-store / DB)    │                              │
      │                              │                              │
      │  POST /v1/chat/completions   │                              │
      │  { model, messages } +       │                              │
      │  x-api-key / auth_state      │                              │
      │─────────────────────────────►│                              │
      │                              │  GET /chat/completions       │
      │                              │  Authorization: Bearer <tok>│
      │                              │─────────────────────────────►│
      │                              │                              │
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Hono** as the HTTP framework | Lightweight, fast, TypeScript-native, Bun-compatible |
| **Drizzle ORM** for persistence | Type-safe queries, relations, migrations, PostgreSQL-native |
| **Zod schemas** for runtime validation | End-to-end type safety from API boundary to DB |
| **PKCE S256** for OAuth | Prevents authorization code interception attacks |
| **In-memory session store** (route-level) | Simple for device-code flow; state is ephemeral (minutes) |
| **AuthState object** as persistence unit | Complete snapshot of tokens + metadata for any storage backend |
| **Delete-then-insert** token rotation | Prevents stale token accumulation per provider+user |

---

## 2. Database Schema

All schemas use **Drizzle ORM** with PostgreSQL identity columns, UUID primary keys, JSONB for structured error data, and proper indexes.

### 2.1 Reusable Timestamps Pattern

```typescript
// src/db/schema.ts
export const timestamps = {
  createdAt: timestamp("created_at", {
    mode: "date",
    precision: 3,
    withTimezone: true,
  }).defaultNow().notNull(),

  updatedAt: timestamp("updated_at", {
    mode: "date",
    precision: 3,
    withTimezone: true,
  }).defaultNow().notNull().$onUpdateFn(() => new Date()),
};
```

### 2.2 Users Table

```typescript
export const user = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  name: text("name"),
  email: varchar({ length: 255 }).notNull().unique(),
  ...timestamps,
});
```

### 2.3 OAuth Providers Table

Stores the provider configuration for a user. Multiple providers per user, one `isActive` per provider.

```typescript
export const oauthProvider = pgTable(
  "oauth_providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),       // e.g. "minimax-oauth"
    region: text("region").notNull(),                 // e.g. "global" | "cn"
    portalBaseUrl: text("portal_base_url").notNull(),
    inferenceBaseUrl: text("inference_base_url").notNull(),
    clientId: text("client_id").notNull(),
    scope: text("scope").notNull(),
    resourceUrl: text("resource_url"),
    isActive: boolean("is_active").default(true),
    ...timestamps,
  },
  (table) => [
    index("oauth_provider_user_idx").on(table.userId),
    index("oauth_providers_active_idx")
      .on(table.isActive)
      .where(sql`${table.isActive}= true`),          // Partial index
  ],
);
```

### 2.4 OAuth Tokens Table

One token record per provider+user. Tokens are rotated on refresh: **delete-then-insert**.

```typescript
export const oauthToken = pgTable("oauth_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => oauthProvider.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenType: text("token_type").notNull().default("Bearer"),
  scope: text("scope").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  obtainedAt: timestamp("obtained_at", { withTimezone: true })
    .defaultNow().notNull(),
  lastError: jsonb("last_error").$type<{
    code: string;
    message: string;
    reason: string;
    reloginRequired: boolean;
    at: string;
  } | null>(),
  ...timestamps,
});
```

### 2.5 Inference Sessions Table

Tracks inference calls per provider+user to monitor token health.

```typescript
export const inferenceSessions = pgTable("inference_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => oauthProvider.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .defaultNow().notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  tokenExpired: boolean("token_expired").default(false),
});
```

### 2.6 Drizzle Relations

```typescript
export const userRelations = relations(user, ({ many }) => ({
  oauthProviders: many(oauthProvider),
  oauthTokens: many(oauthToken),
  inferenceSessions: many(inferenceSessions),
}));

export const oauthProviderRelations = relations(
  oauthProvider,
  ({ many, one }) => ({
    user: one(user, {
      fields: [oauthProvider.userId],
      references: [user.id],
    }),
    tokens: many(oauthToken),
    inferenceSessions: many(inferenceSessions),
  }),
);

export const oauthTokenRelations = relations(oauthToken, ({ one }) => ({
  provider: one(oauthProvider, {
    fields: [oauthToken.providerId],
    references: [oauthProvider.id],
  }),
  user: one(user, {
    fields: [oauthToken.userId],
    references: [user.id],
  }),
}));
```

### 2.7 Connection Pool Setup

```typescript
// src/db/index.ts
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
});

export const db = drizzle({ client: pool });
```

---

## 3. Types & Zod Validation

### 3.1 OAuth Type Definitions

```typescript
// src/types/oauth.ts
import { createInsertSchema } from "drizzle-zod";
import z from "zod";
import { oauthToken, user } from "../db/schema";

export const createUserSchema = createInsertSchema(user);
export const OAuthTokenSchema = createInsertSchema(oauthToken);

// Schema for persisting new tokens (omit auto-generated fields)
export const PersistOuthTokensSchema = OAuthTokenSchema.omit({
  createdAt: true,
  updatedAt: true,
  id: true,
  lastError: true,
});

// Schema for reading token records back
export const TokenRecordSchema = OAuthTokenSchema.pick({
  id: true,
  lastError: true,
  createdAt: true,
  updatedAt: true,
  accessToken: true,
  userId: true,
  providerId: true,
  refreshToken: true,
  tokenType: true,
  obtainedAt: true,
  scope: true,
  expiresAt: true,
}).extend({
  lastError: z
    .object({
      code: z.string(),
      message: z.string(),
      reason: z.string(),
      reloginRequired: z.boolean(),
      at: z.string(),
    })
    .nullable(),
});

export type OauthToken = z.infer<typeof PersistOuthTokensSchema>;
export type TokenRecord = z.infer<typeof TokenRecordSchema>;
```

### 3.2 MiniMax-Specific Zod Schemas

```typescript
// src/types/minimax-types.ts
import { z } from "zod";

export const Region = z.enum(["global", "cn"]);
export type Region = z.infer<typeof Region>;

export const PkcePair = z.object({
  verifier: z.string().min(1),
  challenge: z.string().min(1),
  state: z.string().min(1),
});

export const UserCodeResponse = z.object({
  user_code: z.string().min(1),
  verification_uri: z.string().url(),
  expired_in: z.number().int().positive(),
  interval: z.number().int().positive().optional(),
  state: z.string().min(1),
});

export const TokenSuccessPayload = z.object({
  status: z.literal("success"),
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expired_in: z.number().int().positive(),
  token_type: z.string().optional().default("Bearer"),
  resource_url: z.string().optional(),
  notification_message: z.string().optional(),
});

export const TokenErrorPayload = z.object({
  status: z.literal("error"),
  base_resp: z.object({
    status_msg: z.string().optional(),
  }).optional(),
});

export const TokenPendingPayload = z.object({
  status: z.string(),
});

// Discriminated union: Zod automatically narrows by `status` field
export const TokenResponse = z.discriminatedUnion("status", [
  TokenSuccessPayload,
  TokenErrorPayload,
  TokenPendingPayload,
]);
export type TokenResponse = z.infer<typeof TokenResponse>;

// Persisted auth state — the complete snapshot
export const AuthState = z.object({
  provider: z.literal("minimax-oauth"),
  region: Region,
  portal_base_url: z.string().url(),
  inference_base_url: z.string().url(),
  client_id: z.string().min(1),
  scope: z.string().min(1),
  token_type: z.string().default("Bearer"),
  access_token: z.string(),
  refresh_token: z.string(),
  resource_url: z.string().optional(),
  obtained_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  expires_in: z.number().int().nonnegative(),
});
export type AuthState = z.infer<typeof AuthState>;

// Runtime credentials — resolved for inference calls
export const RuntimeCredentials = z.object({
  provider: z.literal("minimax-oauth"),
  api_key: z.string().min(1),
  base_url: z.string().url(),
  source: z.literal("oauth"),
});

export const AuthStatus = z.object({
  logged_in: z.boolean(),
  provider: z.literal("minimax-oauth"),
  region: Region.optional(),
  expires_at: z.string().datetime().optional(),
});
```

### 3.3 Abstract Auth Store Interface

```typescript
export interface AuthStore {
  get(): Promise<AuthState | null>;
  set(state: AuthState): Promise<void>;
}
```

### 3.4 AuthState (Interface) for Internal Use

```typescript
interface OAuthState {
  provider: string;
  region?: string;
  portal_base_url: string;
  inference_base_url: string;
  client_id: string;
  scope: string;
  token_type: string;
  access_token: string;
  refresh_token: string;
  resource_url?: string;
  obtained_at: string;
  expires_at: string;
  expires_in: number;
  last_auth_error?: {
    provider: string;
    code: string;
    message: string;
    reason: string;
    relogin_required: boolean;
    at: string;
  };
}
```

---

## 4. Utility Layer

### 4.1 PKCE Pair Generation

```typescript
// src/utils/minimax-utils.ts
export function generatePKCEPair(): {
  verifier: string;
  challenge: string;
  state: string;
} {
  // 96-char base64url random string (RFC 7636)
  const verifier = crypto.randomBytes(64).toString("base64url").slice(0, 96);
  // SHA-256 hash -> base64url (unpadded)
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  // Hex nonce for CSRF protection
  const state = crypto.randomBytes(16).toString("hex");
  return { verifier, challenge, state };
}
```

### 4.2 Token Fingerprinting

```typescript
// src/utils/oauth.ts — SHA-256 prefix fingerprint
export const tokenFingerprint = (token: unknown): string | null => {
  if (typeof token !== "string" || !token.trim()) return null;
  return crypto
    .createHash("sha256")
    .update(token.trim())
    .digest("hex")
    .slice(0, 12);
};
```

### 4.3 Expiry Heuristic (MiniMax-Specific)

MiniMax's `expired_in` is **ambiguous**:
- Can be a **unix-ms absolute timestamp** (value > `Date.now() / 2`)
- Can be a **TTL in seconds** (value <= `Date.now() / 2`)

```typescript
export function resolveTokenExpiry(expiredIn: number): number {
  const nowMs = Date.now();
  const raw = Number(expiredIn);
  // If larger than half of Date.now(), it's absolute ms
  if (raw > nowMs / 2) return raw / 1000; // convert to unix seconds
  // Otherwise it's TTL in seconds
  return Math.floor(Date.now() / 1000) + Math.max(1, raw);
}
```

### 4.4 Expiry Check

```typescript
export const isExpiring = (
  expiresAtISO: unknown,
  skewSeconds: number,  // default: 60s
): boolean => {
  const epoch = parseISOTimestamp(expiresAtISO);
  if (epoch === null) return true; // assume expiring if unparseable
  return epoch <= Date.now() / 1000 + skewSeconds;
};
```

### 4.5 Secret Validation

```typescript
export const hasUsableSecret = (value: unknown, minLength = 4): boolean => {
  if (typeof value !== "string") return false;
  const cleaned = value.trim();
  if (cleaned.length < minLength) return false;
  const placeholders = new Set([
    "*", "**", "***", "changeme", "your_api_key",
    "your-api-key", "placeholder", "example", "dummy",
    "null", "none",
  ]);
  return !placeholders.has(cleaned.toLowerCase());
};
```

### 4.6 Error Response Parser

```typescript
export async function parseErrorBody(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body === "object") {
      const msg =
        body.base_resp?.status_msg ??
        body.error?.message ??
        body.error;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
    }
  } catch { /* ignore */ }
  try {
    const text = await response.text();
    if (text.trim()) return text.trim();
  } catch { /* ignore */ }
  return `${response.status} ${response.statusText}`;
}
```

### 4.7 HTTP Assertion Helper

```typescript
export async function assertOk(
  response: Response,
  context: string,
): Promise<void> {
  if (response.ok) return;
  const detail = await parseErrorBody(response);
  throw new MinimaxOAuthError(`${context}: ${detail}`, {
    reloginRequired: response.status === 401,
  });
}
```

### 4.8 Remote Session Detection

```typescript
export function isRemoteSession(): boolean {
  if (process.env.SSH_CLIENT || process.env.SSH_TTY) return true;
  for (const variable of [
    "CLOUD_SHELL", "CODESPACES", "CODESPACE_NAME",
    "GITPOD_WORKSPACE_ID", "REPL_ID", "STACKBLITZ",
  ]) {
    if (process.env[variable]) return true;
  }
  return false;
}
```

---

## 5. MiniMax OAuth

### 5.1 Provider Constants

```typescript
// src/constants.ts
export const MINIMAX = {
  OAUTH: {
    CLIENT_ID: "78257093-7e40-4613-99e0-527b14b39113",
    SCOPE: "group_id profile model.completion",
    GRANT_TYPE: "urn:ietf:params:oauth:grant-type:user_code",
    REFRESH_SKEW_SECONDS: 60,
  },
  ENDPOINTS: {
    global: {
      portal: "https://api.minimax.io",
      inference: "https://api.minimax.io/anthropic",
    },
    cn: {
      portal: "https://api.minimaxi.com",
      inference: "https://api.minimaxi.com/anthropic",
    },
  },
  DEFAULT_REGION: "global",
} as const;
```

### 5.2 OAuth Client Class

```typescript
export class MiniMaxOAuthClient {
  readonly clientId = MINIMAX.OAUTH.CLIENT_ID;
  readonly scope = MINIMAX.OAUTH.SCOPE;
  readonly grantType = MINIMAX.OAUTH.GRANT_TYPE;

  getPortalBase(region: string): string { /* endpoints lookup */ }
  getInferenceBase(region: string): string { /* endpoints lookup */ }

  generatePKCE(): { codeVerifier: string; codeChallenge: string; state: string } {
    // 48 random bytes = 64 base64url chars, sliced to 96 chars
    const codeVerifier = crypto.randomBytes(48).toString("base64url").slice(0, 96);
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest()
      .toString("base64url");
    const state = crypto.randomBytes(16).toString("base64url");
    return { codeChallenge, codeVerifier, state };
  }

  resolveExpiryUnix(expiredIn: number): number {
    // Heuristic: if raw > nowMs/2, treat as unix-ms absolute; else TTL seconds
  }
}
```

### 5.3 Flow: Step 1 — Request User Code

**Endpoint:** `POST {portal}/oauth/code`

```
Content-Type: application/x-www-form-urlencoded
x-request-id: <uuid>

response_type=code
client_id=78257093-...
scope=group_id+profile+model.completion
code_challenge=<S256>
code_challenge_method=S256
state=<nonce>
```

**Response:**
```json
{
  "user_code": "ABC123",
  "verification_uri": "https://api.minimax.io/oauth/verify",
  "expired_in": 300,
  "interval": 2000,
  "state": "<echoed nonce>"
}
```

**CSRF Check:** Validate `response.state === sent state` before proceeding.

### 5.4 Flow: Step 2 — Poll for Token

**Endpoint:** `POST {portal}/oauth/token`

```
grant_type=urn:ietf:params:oauth:grant-type:user_code
client_id=78257093-...
user_code=ABC123
code_verifier=<original verifier>
```

**Polling loop:**
- Calculate `deadline` from `expired_in` (handles both unix-ms and TTL)
- Interval: `max(2000, response.interval || 2000)`
- `status === "success"` → extract tokens, break
- `status === "error"` → throw, abort
- Any other status (including HTTP 202) → keep polling
- Deadline exceeded → timeout error

**Success Response:**
```json
{
  "status": "success",
  "access_token": "mmx-...",
  "refresh_token": "mmx-refresh-...",
  "expired_in": 86400,
  "token_type": "Bearer"
}
```

### 5.5 Flow: Step 3 — Build Auth State

```typescript
function buildAuthState(
  region: "global" | "cn",
  tokenData: TokenSuccessPayload,
): AuthState { ... }
```

### 5.6 Flow: Token Refresh

**Endpoint:** `POST {portal}/oauth/token`

```
grant_type=refresh_token
client_id=78257093-...
refresh_token=mmx-refresh-...
```

**Refresh logic:**
1. Check `expires_at - now > REFRESH_SKEW_SECONDS (60s)`. If still fresh, return existing state.
2. POST refresh request
3. On success: save **new** access_token, refresh_token, expires_at
4. On `invalid_grant` / `refresh_token_reused` / `invalid_refresh_token` → **quarantine**

**Important:** MiniMax's refresh token may be **rotated**. Always use the new one from the response.

---

## 6. MiniMax Inference

### 6.1 Inference Provider Object

```typescript
export const MinimaxInference = {
  async chat(req: Record<string, unknown>, authState: AuthState): Promise<Response> {
    const baseUrl = authState.inference_base_url.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      body: JSON.stringify(req),
      headers: {
        Authorization: `Bearer ${authState.access_token}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`MiniMax inference error ${response.status}: ${body}`);
    }
    return response;
  },

  async getAllModels(authState: AuthState): Promise<Response> {
    const baseUrl = authState.inference_base_url.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${authState.access_token}` },
    });
    // ...
  },
};
```

### 6.2 Auth Forwarding Pattern

When the gateway forwards a chat request to MiniMax:
- `authState.access_token` → `Authorization: Bearer <token>`
- `authState.inference_base_url` → base URL for the API call
- If the call fails with 401, the gateway can trigger a token refresh

---

## 7. Antigravity OAuth

A completely different OAuth pattern — uses **Google's authorization-code flow** with **PKCE** and **client secret**.

### 7.1 Authorization URL Builder

```typescript
export async function authorizeAntigravity(projectId = ""): Promise<AntigravityAuthorization> {
  const pkce = await generatePKCE(); // from @openauthjs/openauth/pkce

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", ANTIGRAVITY_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", ANTIGRAVITY_REDIRECT_URI);
  url.searchParams.set("scope", ANTIGRAVITY_SCOPES.join(" "));
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");

  // State encodes PKCE verifier + project ID (base64url JSON)
  url.searchParams.set("state", encodeState({
    verifier: pkce.verifier,
    projectId: projectId || "",
  }));

  url.searchParams.set("access_type", "offline");   // get refresh_token
  url.searchParams.set("prompt", "consent");         // force consent screen

  return { url: url.toString(), verifier: pkce.verifier, projectId };
}
```

### 7.2 Token Exchange

```typescript
export async function exchangeAntigravity(
  code: string,
  state: string,
): Promise<AntigravityTokenExchangeResult> {
  const { verifier, projectId } = decodeState(state);

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ANTIGRAVITY_CLIENT_ID,
      client_secret: ANTIGRAVITY_CLIENT_SECRET,  // confidential client
      code,
      grant_type: "authorization_code",
      redirect_uri: ANTIGRAVITY_REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  // ...
}
```

### 7.3 Key Differences from MiniMax

| Aspect | MiniMax (Device-Code) | Antigravity (Auth-Code) |
|--------|----------------------|------------------------|
| **Grant Type** | `urn:ietf:params:oauth:grant-type:user_code` | `authorization_code` |
| **Client Type** | Public (no secret) | Confidential (client_secret) |
| **User Action** | Code entry in browser | Redirect-based consent |
| **Token Acquisition** | Polling loop | Callback (single exchange) |
| **Session Storage** | In-memory (ephemeral PKCE) | State-encoded (PKCE in redirect URI) |

---

## 8. API Routes

### 8.1 Route Registration (Hono)

```typescript
// src/index.ts
const app = new Hono();
app.use("*", cors());
app.use("*", logger());

app.route("/", modelsRoute);
app.route("/", minimaxAuthRoute);       // POST /minimax/auth/*
app.post("/v1/chat/completions", chatController);
```

### 8.2 Route: POST /minimax/auth/init

Starts the device-code flow. Generates PKCE pair, stores in ephemeral in-memory map.

```typescript
minimaxAuthRoute.post("/minimax/auth/init", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const region: "global" | "cn" = body.region === "cn" ? "cn" : "global";
  const endpoints = MINIMAX.ENDPOINTS[region];

  // 1. Generate PKCE
  const pkceBytes = crypto.randomBytes(64).toString("base64url").slice(0, 96);
  const challenge = crypto.createHash("sha256").update(pkceBytes).digest("base64url");
  const state = crypto.randomBytes(16).toString("hex");

  // 2. POST to provider
  const response = await fetch(`${endpoints.portal}/oauth/code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      response_type: "code",
      client_id: MINIMAX.OAUTH.CLIENT_ID,
      scope: MINIMAX.OAUTH.SCOPE,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
    }).toString(),
  });

  if (!response.ok) { /* 502 error */ }
  const data = await response.json();

  // 3. CSRF check
  if (data.state !== state) { /* 400 error */ }

  // 4. Store PKCE in-memory session
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { verifier: pkceBytes, challenge, state, region });

  return c.json({
    session_id: sessionId,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    expired_in: data.expired_in,
    interval: data.interval,
    portal: endpoints.portal,
  });
});
```

### 8.3 Route: POST /minimax/auth/poll

Polls the provider for the token after the user approves in the browser.

```typescript
minimaxAuthRoute.post("/minimax/auth/poll", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { session_id, user_code, expired_in, interval } = body;

  if (!session_id || !sessions.has(session_id)) {
    return c.json({ error: "Invalid or expired session" }, 400);
  }

  const session = sessions.get(session_id)!;
  const endpoints = MINIMAX.ENDPOINTS[session.region];

  try {
    const tokenData = await pollForToken(
      endpoints.portal, user_code, session.verifier,
      Number(expired_in ?? 300), Number(interval ?? 2000),
    );

    const st = buildAuthState(session.region, tokenData);
    sessions.delete(session_id); // clean up ephemeral state

    return c.json({ status: "success", auth_state: st });
  } catch (err) {
    return c.json({ status: "pending" }, 202); // still waiting
  }
});
```

### 8.4 Route: POSt /minimax/auth/refresh

Refreshes an existing token.

```typescript
minimaxAuthRoute.post("/minimax/auth/refresh", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const st = body.auth_state;
  if (!st) return c.json({ error: "auth_state is required" }, 400);

  try {
    const refreshed = await refreshTokens(st);
    return c.json({ status: "success", auth_state: refreshed });
  } catch (err) {
    const isTerminal = err instanceof Error && "reloginRequired" in err;
    return c.json({
      status: "error",
      message: err instanceof Error ? err.message : "Refresh failed",
      relogin_required: isTerminal,
    }, 401);
  }
});
```

### 8.5 Non-OAuth Provider: NVIDIA

Simple static API key pattern (no OAuth):

```typescript
export const Nvidia = {
  async chat(req: ChatCompletionRequest): Promise<Response> {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req),
    });
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    return response;
  },
};
```

---

## 9. Token Lifecycle

### 9.1 Persistence Functions

**Save tokens (delete-then-insert):**

```typescript
export async function saveTokens(input: OauthToken) {
  // Delete existing tokens for this provider+user
  await db
    .delete(oauthToken)
    .where(
      and(
        eq(oauthToken.providerId, input.providerId),
        eq(oauthToken.userId, input.userId),
      ),
    );

  // Insert new token record
  const [token] = await db
    .insert(oauthToken)
    .values({
      providerId: input.providerId,
      userId: input.userId,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      tokenType: input.tokenType,
      scope: input.scope,
      expiresAt: input.expiresAt,
    })
    .returning();

  return token;
}
```

**Get latest token metadata (no tokens returned, for privacy):**

```typescript
export async function getLatestToken(
  providerId: string,
  userId: string,
): Promise<TokenRecord | null> {
  const [token] = await db
    .select({
      id: oauthToken.id,
      lastError: oauthToken.lastError,
      updatedAt: oauthToken.updatedAt,
      createdAt: oauthToken.createdAt,
    })
    .from(oauthToken)
    .where(
      and(
        eq(oauthToken.providerId, providerId),
        eq(oauthToken.userId, userId),
      ),
    )
    .orderBy(desc(oauthToken.createdAt))
    .limit(1);

  return token ?? null;
}
```

**Update existing tokens (refresh path):**

```typescript
export const updateToken = async (
  providerId: string,
  userId: string,
  data: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: Date;
  },
) => {
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.accessToken) updateData.accessToken = data.accessToken;
  if (data.refreshToken) updateData.refreshToken = data.refreshToken;
  if (data.expiresAt) updateData.expiresAt = data.expiresAt;

  await db
    .update(oauthToken)
    .set(updateData)
    .where(
      and(
        eq(oauthToken.providerId, providerId),
        eq(oauthToken.userId, userId),
      ),
    );
};
```

### 9.2 Token Refresh Flow

```
Incoming Request (with auth_state/userId)
        │
        ▼
    is token expiring?              ← isExpiring(expiresAt, skew=60s)
        │
   ┌────┴────┐
   │ YES     │ NO
   │         │
   ▼         ▼
 Refresh  Return existing
   │      access_token
   ▼
 POST /oauth/token (refresh_token)
   │
   ├── success → update DB, return new token
   │
   └── error ─→ quarantine tokens
                ─→ set lastError on record
                ─→ nullify access/refresh tokens
```

### 9.3 Expiring Token Query

```typescript
export const getExpiringTokens = async (skewSeconds: number) => {
  const skewInterval = sql`INTERVAL '${sql.raw(String(skewSeconds))} seconds'`;
  return db
    .select()
    .from(oauthToken)
    .where(lt(oauthToken.expiresAt, sql`NOW() + ${skewInterval}`));
};
```

### 9.4 Auth Status

```typescript
export async function getAuthStatus(
  userId: string,
  providerId: string,
): Promise<{
  loggedIn: boolean;
  provider?: string;
  region?: string;
  expiresAt: string | null;
  hasRefreshToken: boolean;
  lastError: string | null;
}> {
  const provider = await getActiveProviderByUserId(userId, providerId);
  if (!provider) return { loggedIn: false, expiresAt: null, hasRefreshToken: false, lastError: null };

  const token = await getLatestToken(providerId, userId);
  if (!token || !token.accessToken) {
    return { lastError: token?.lastError?.message ?? null, loggedIn: false, ... };
  }

  return {
    expiresAt: token.expiresAt.toISOString(),
    hasRefreshToken: !!token.refreshToken,
    lastError: token.lastError?.message ?? null,
    loggedIn: token.expiresAt > new Date(),
    provider: providerId,
    region: provider.region,
  };
}
```

---

## 10. Error Handling & Quarantine

### 10.1 Auth Error Classes

```typescript
// src/types/errors.ts
export class AuthError extends Error {
  readonly provider: string;
  readonly code: string;
  readonly relogin_required: boolean;
  readonly statusCode: number;

  constructor(
    message: string,
    opts: { provider?: string; code?: string | null; relogin_required?: boolean; statusCode?: number } = {},
  ) {
    super(message);
    this.name = "AuthError";
    this.provider = opts.provider ?? "";
    this.code = opts.code ?? null;
    this.relogin_required = opts.relogin_required ?? false;
    this.statusCode = opts.statusCode ?? 500;
  }
}
```

### 10.2 MiniMax-Specific Error

```typescript
export class MinimaxOAuthError extends Error {
  public readonly reloginRequired: boolean;
  constructor(
    message: string,
    options?: { reloginRequired?: boolean; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "MinimaxOAuthError";
    this.reloginRequired = options?.reloginRequired ?? false;
  }
}
```

### 10.3 Token Quarantine

When refresh fails with terminal errors (`invalid_grant`, `refresh_token_reused`, `invalid_refresh_token`), the tokens are **quarantined**:

```typescript
export const quarantineTokens = async (
  providerId: string,
  userId: string,
  error: AuthError,
) => {
  await db
    .update(oauthToken)
    .set({
      lastError: {
        code: error.code,
        message: error.message,
        reason: "runtime_refresh_failure",
        reloginRequired: error.relogin_required,
        at: new Date().toISOString(),
      },
      accessToken: null,    // Clear tokens
      refreshToken: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(oauthToken.providerId, providerId),
        eq(oauthToken.userId, userId),
      ),
    );
};
```

**Effects of quarantine:**
- routing metadata remains (providerId, userId, region)
- tokens are nullified
- `lastError` is populated with failure details
- Subsequent `getLatestToken` returns no valid tokens
- `getAuthStatus` shows `loggedIn: false` with the error message
- User must re-authenticate

### 10.4 Inference Session Tracking

```typescript
// Track when token expires during inference
export const endInferenceSession = async (
  id: string,
  tokenExpired = false,
) => {
  await db
    .update(inferenceSessions)
    .set({ endedAt: new Date(), tokenExpired })
    .where(eq(inferenceSessions.id, id));
};
```

### 10.5 Error Flow Summary

```
Token Refresh
      │
      ▼
  HTTP call to provider
      │
  ┌───┴───┐
  │ 200   │ 401 / 400
  │       │
  ▼       ▼
Update  Check error code
 DB     │
        ├── invalid_grant
        ├── refresh_token_reused
        ├── invalid_refresh_token
        │   → Terminal: QUARANTINE
        │
        └── Any other → Retry / fail
```

---

## 11. Flow Diagrams

### 11.1 MiniMax Device-Code OAuth (Complete)

```
CLIENT                    API GATEWAY (Hono)              MINIMAX PORTAL                BROWSER
  │                              │                              │                           │
  │──── POST /minimax/auth/init ─►                              │                           │
  │                              │──── POST /oauth/code ───────►│                           │
  │                              │◄─── { user_code, uri } ─────│                           │
  │◄─── { session_id, code } ────│                              │                           │
  │                              │                              │                           │
  │Show user_code to user─────────────────────────────────────────────────────────────────►│
  │                              │                              │    User opens URI         │
  │                              │                              │◄──────────────────────────│
  │                              │                              │    User enters code        │
  │                              │                              │◄──────────────────────────│
  │                              │                              │    User approves           │
  │                              │                              │◄──────────────────────────│
  │                              │                              │                           │
  │──── POST /minimax/auth/poll ─►                              │                           │
  │   { session_id, user_code }  │                              │                           │
  │                              │──── POST /oauth/token ──────►│                           │
  │                              │   grant_type=user_code       │                           │
  │                              │   user_code=ABC123           │                           │
  │                              │   code_verifier=...          │                           │
  │                              │◄─── { access, refresh } ────│                           │
  │◄─── { auth_state } ──────────│                              │                           │
  │                              │                              │                           │
  │Persist auth_state to DB      │                              │                           │
  │                              │                              │                           │
  │──── POST /v1/chat/ ─────────►│                              │                           │
  │   completions (with key via  │                              │                           │
  │   x-api-key)                 │                              │                           │
  │                              │ Check: token expiring?       │                           │
  │                              │ If yes: POST /oauth/token    │                           │
  │                              │         (refresh_token)      │                           │
  │                              │─────────────────────────────►│                           │
  │                              │◄─── new access_token ───────│                           │
  │                              │                              │                           │
  │                              │──── POST /chat/completions ──►│                           │
  │                              │   Authorization: Bearer ...  │                           │
  │◄──── stream / response ──────│◄─────────────────────────────│                           │
```

### 11.2 Antigravity Authorization-Code Flow

```
CLIENT                       API GATEWAY                     GOOGLE OAUTH                  USER
  │                              │                              │                           │
  │──── GET /auth/antigravity ──►│                              │                           │
  │   { projectId? }             │                              │                           │
  │                              │  Build authorization URL     │                           │
  │                              │  (PKCE challenge + state)    │                           │
  │◄─── { url, verifier } ───────│                              │                           │
  │                              │                              │                           │
  │Open browser to URL─────────────────────────────────────────►│                           │
  │                              │                              │   User signs in + consents│
  │                              │                              │◄──────────────────────────│
  │                              │                              │                           │
  │                              │  Redirect back with `code`   │                           │
  │                              │◄─────────────────────────────│                           │
  │                              │                              │                           │
  │                              │  POST /token                 │                           │
  │                              │  code + verifier + secret    │                           │
  │                              │─────────────────────────────►│                           │
  │                              │◄─── { access, refresh } ────│                           │
  │                              │                              │                           │
  │                              │  Fetch project via           │                           │
  │                              │  loadCodeAssist API          │                           │
  │                              │─────────────────────────────►│                           │
  │                              │◄─── { projectId } ──────────│                           │
  │                              │                              │                           │
  │◄─── { tokens, projectId } ───│                              │                           │
```

### 11.3 Token Refresh Lifecycle

```
  User sends request
        │
        ▼
  Gateway gets auth_state / token
        │
        ├── Token expired / expiring?
        │       │
        │       ├── YES → POST /minimax/auth/refresh
        │       │            │
        │       │            ├── 200 OK ──→ update DB with new tokens
        │       │            │               continue with fresh access_token
        │       │            │
        │       │            └── 401 / error ──→ quarantine in DB
        │       │                                 return 401 to client
        │       │                                 (user must re-auth)
        │       │
        │       └── NO → use existing access_token
        │
        ▼
  Forward to inference provider
        │
        ├── 200 OK ──→ return response to client ✓
        │
        └── 401 Unauthorized ──→ Token may have expired mid-flight
                                  → attempt refresh
                                  → if refresh fails, quarantine
```

### 11.4 State Machine

```
┌──────────┐    /auth/init    ┌──────────────┐
│  IDLE    │────────────────►│ AWAITING_APPROVAL │
│          │                 │                │
│ (no ssn) │                 │ (PKCE stored   │
└──────────┘                 │  in-memory)    │
                             └───────┬────────┘
                                     │ User approved in browser
                                     ▼
                             ┌──────────────┐    success    ┌──────────┐
                             │ POLLING      │──────────────►│ TOKENS   │
                             │              │               │ ACQUIRED │
                             └──────────────┘               └────┬─────┘
                                                                 │
                                ┌──────────────────────────────┐ │
                                ▼                              ▼ ▼
                      ┌─────────────────┐           ┌──────────────────┐
                      │ ACTIVE (inference)│         │  EXPIRING (<60s) │
                      │                  │         │                  │
                      │ Authorization:   │         │ Trigger refresh  │
                      │ Bearer <token>   │         │                  │
                      └────────┬─────────┘         └────────┬─────────┘
                               │                            │
                               │ 401                        │ success
                               ▼                            ▼
                      ┌─────────────────┐           ┌──────────────────┐
                      │ REFRESHING      │           │ REJUVENATED     │
                      │                 │           │ (tokens updated) │
                      │ POST /oauth/    │           └──────────────────┘
                      │ token (refresh) │
                      └────────┬────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
           ┌─────────────────┐  ┌──────────────────┐
           │ QUARANTINED     │  │ REJUVENATED      │
           │                 │  │                  │
           │ tokens cleared  │  │ new access_token │
           │ lastError set   │  │ new refresh_token│
           │ re-auth needed  │  │ new expires_at   │
           └─────────────────┘  └──────────────────┘
```

---

## 12. Best Practices Checklist

### Database & ORM (Drizzle)

- [x] UUID primary keys with `defaultRandom()`
- [x] `generatedAlwaysAsIdentity()` available for integer PKs
- [x] Timestamps with `withTimezone: true`, `mode: "date"`, `precision: 3`
- [x] `.$onUpdateFn(() => new Date())` for auto-update on `updatedAt`
- [x] JSONB with `.$type<>` for structured error data
- [x] Partial indexes for `isActive` queries
- [x] Foreign key indexes on `userId`, `providerId`
- [x] Foreign keys with `onDelete: "cascade"`
- [x] Cascading deletes ensure token cleanup when provider/user is removed
- [x] Relations defined for relational query API

### API & Routing (Hono)

- [x] CORS enabled globally
- [x] Request logger middleware
- [x] Error handler with structured error responses
- [x] Route-level in-memory session for ephemeral OAuth state
- [x] Session ID used to isolate concurrent OAuth flows

### OAuth Security

- [x] PKCE S256 for all authorization-code flows
- [x] CSRF state nonce validated in response
- [x] `access_type=offline` + `prompt=consent` for refresh tokens
- [x] Token exchange uses `application/x-www-form-urlencoded`
- [x] Token rotation handled (use new refresh_token always)
- [x] AuthError with `relogin_required` flag
- [x] Token quarantine on terminal refresh failure
- [x] Delete-then-insert pattern prevents stale token accumulation

### Types & Validation (Zod)

- [x] Runtime validation of all OAuth API responses
- [x] Discriminated union (`z.discriminatedUnion`) for token polling states
- [x] `createInsertSchema` from `drizzle-zod` for DB-backed types
- [x] `z.infer` for TypeScript types derived from schemas
- [x] Provider-specific error classes

### Token Management

- [x] Expiry heuristic for ambiguous MiniMax `expired_in` field
- [x] Configurable refresh skew window (60s default)
- [x] Token fingerprinting for secure logging
- [x] Inference session tracking per token
- [x] Token expired flag on session end

### Production Considerations (Future)

| Gap | Recommendation |
|-----|----------------|
| **No cron-based refresh** | `getExpiringTokens` exists but no scheduler uses it yet |
| **In-memory PKCE store** | Replace with DB or Redis for multi-replica deployments |
| **No rate limiting on /auth/init** | Add rate limiting per IP to prevent abuse |
| **No session rotation** | Consider key rotation policies |
| **No audit logging** | Add structured audit events for auth operations |
| **No token encryption at rest** | Consider encrypting tokens in the DB with app-level key |

---

## File Inventory

| File | Purpose |
|------|---------|
| `src/constants.ts` | Provider config (client ID, scopes, endpoints) |
| `src/types/oauth.ts` | Shared OAuth types + drizzle-zod schemas |
| `src/types/minimax-types.ts` | MiniMax-specific Zod schemas, discriminated unions, error classes |
| `src/types/errors.ts` | AppError + AuthError hierarchy |
| `src/utils/oauth.ts` | Secret validator, expiry check, token fingerprint |
| `src/utils/minimax-utils.ts` | PKCE generation, expiry resolver, HTTP helpers, error parser |
| `src/utils/utils.ts` | Shared utility (ISO timestamp parsing) |
| `src/db/schema.ts` | Drizzle ORM schema: users, oauth_providers, oauth_tokens, inference_sessions + relations |
| `src/db/index.ts` | Drizzle client init with pg Pool |
| `src/oauth/minimax.ts` | OAuth DB operations: save/update/quarantine tokens, auth status |
| `src/providers/minimax.ts` | MiniMaxOAuthClient class (PKCE, endpoints, token logic) |
| `src/providers/minimax-inference.ts` | MiniMax inference calls (chat, models) using OAuth tokens |
| `src/providers/nvidia.ts` | Non-OAuth NVIDIA provider (static API key) |
| `src/routes/minimax-auth.ts` | Hono routes: /minimax/auth/init, /poll, /refresh, /status |
| `src/index.ts` | Hono app entry point, middleware, route registration |