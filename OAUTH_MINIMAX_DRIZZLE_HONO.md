# MiniMax OAuth — Database-Backed Implementation (Drizzle + Hono + Bun + Zod)

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [MiniMax OAuth Protocol — Complete Flow](#minimax-oauth-protocol)
3. [Database Schema — Drizzle ORM + PostgreSQL](#database-schema)
4. [Zod Schemas — Validation Layer](#zod-schemas)
5. [Auth Store — Drizzle Repository Layer](#auth-store)
6. [MiniMax OAuth Client — Full Implementation](#minimax-oauth-client)
7. [Hono API Routes — HTTP Endpoints](#hono-api-routes)
8. [Token Provider Pattern — Per-Request Refresh](#token-provider)
9. [Quarantine Pattern — Dead Token Cleanup](#quarantine)
10. [Project Setup](#project-setup)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    Application Layer                              │
│                                                                   │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐  │
│  │   Hono HTTP Routes  │    │   MiniMax OAuth Client          │  │
│  │   (api/auth/*)      │    │   (PKCE + User Code Grant)      │  │
│  └──────────┬──────────┘    └────────────────┬────────────────┘  │
│             │                                │                    │
│             └──────────┬─────────────────────┘                    │
│                        │                                          │
│                ┌───────▼────────┐                                 │
│                │  Auth Service  │                                 │
│                │  (Business     │                                 │
│                │   Logic)       │                                 │
│                └───────┬────────┘                                 │
│                        │                                          │
│                ┌───────▼────────┐                                 │
│                │  Repository    │                                 │
│                │  (Drizzle)     │                                 │
│                └───────┬────────┘                                 │
│                        │                                          │
├────────────────────────┼──────────────────────────────────────────┤
│                        │                                          │
│                ┌───────▼────────┐                                 │
│                │  PostgreSQL    │                                 │
│                │  Database      │                                 │
│                └────────────────┘                                 │
└──────────────────────────────────────────────────────────────────┘
```

### Design Decisions

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **HTTP Framework** | Hono | Lightweight, fast, Bun-native, Zod integration via `@hono/zod-validator` |
| **Runtime** | Bun | All-in-one: TS runner, package manager, test runner |
| **Database** | PostgreSQL | Reliable, JSONB for flexible fields, strong concurrency |
| **ORM** | Drizzle | Type-safe, SQL-like, excellent PG support, relations |
| **Validation** | Zod | Schema-first validation, `z.infer` for types, integrates with Hono |
| **PKCE Crypto** | `crypto` (Bun native) | Built-in SHA-256, base64url, random bytes |

---

## MiniMax OAuth Protocol

### Provider Configuration

```
Client ID:    78257093-7e40-4613-99e0-527b14b39113
Scope:        "group_id profile model.completion"
Grant Type:   "urn:ietf:params:oauth:grant-type:user_code"

Global Portal:  https://api.minimax.io
Global API:     https://api.minimax.io/anthropic

China Portal:   https://api.minimaxi.com
China API:      https://api.minimaxi.com/anthropic

Refresh Skew:  60 seconds (refresh 1 min before expiry)
Access Token:  ~15 minutes (short-lived)
```

### Full Sequence Diagram

```
┌──────────────┐            ┌──────────────┐            ┌────────┐
│  Bun/Hono    │            │  MiniMax     │            │ Browser│
│  Server      │            │  Portal      │            │        │
└──────┬───────┘            └──────┬───────┘            └────┬───┘
       │                          │                          │
       │ 1. Generate PKCE         │                          │
       │    code_verifier         │                          │
       │    code_challenge        │                          │
       │    state                 │                          │
       │                          │                          │
       │ 2. POST /oauth/code      │                          │
       │    response_type=code    │                          │
       │    client_id=...         │                          │
       │    code_challenge=<S256> │                          │
       │    code_challenge_method │                          │
       │    state                 │                          │
       │─────────────────────────>│                          │
       │                          │                          │
       │ 3. Response:             │                          │
       │    {user_code,           │                          │
       │     verification_uri,    │                          │
       │     expired_in,          │                          │
       │     interval}            │                          │
       │<─────────────────────────│                          │
       │                          │                          │
       │ 4. Show URL + Code       │                          │
       │    to user ────────────────────────────────────────>│
       │                          │                          │
       │ 5. User opens URL,       │                          │
       │    enters code           │                          │
       │                          │<──────────────────────────│
       │                          │                          │
       │ 6. POST /oauth/token     │                          │
       │    (poll)                │                          │
       │    grant_type=user_code  │                          │
       │    client_id=...         │                          │
       │    user_code=ABCD-1234   │                          │
       │    code_verifier=...     │                          │
       │─────────────────────────>│                          │
       │                          │                          │
       │ 7. Response:             │                          │
       │    {status: "success",   │                          │
       │     access_token,        │                          │
       │     refresh_token,       │                          │
       │     expired_in}          │                          │
       │<─────────────────────────│                          │
       │                          │                          │
       │ 8. Persist to PostgreSQL │                          │
       │    INSERT INTO           │                          │
       │    oauth_providers       │                          │
       │    oauth_tokens          │                          │
       │                          │                          │
       │ 9. Later: Token refresh  │                          │
       │    POST /oauth/token     │                          │
       │    grant_type=refresh    │                          │
       │─────────────────────────>│                          │
       │    {new access_token}    │                          │
       │<─────────────────────────│                          │
       │    UPDATE oauth_tokens   │                          │
       │                          │                          │
```

### HTTP Request/Response Details

#### Step 2 — Request User Code

```
POST https://api.minimax.io/oauth/code
Content-Type: application/x-www-form-urlencoded
Accept: application/json
x-request-id: <uuid>

Body:
  response_type=code
  client_id=78257093-7e40-4613-99e0-527b14b39113
  scope=group_id+profile+model.completion
  code_challenge=<base64url(sha256(verifier))>
  code_challenge_method=S256
  state=<random_state>
```

Response `200`:
```json
{
  "user_code": "ABCD-1234",
  "verification_uri": "https://api.minimax.io/authorize?code=ABCD-1234",
  "expired_in": 3600000,
  "interval": 2000,
  "state": "<echoed_state>"
}
```

#### Step 6 — Poll for Token

```
POST https://api.minimax.io/oauth/token
Content-Type: application/x-www-form-urlencoded
Accept: application/json

Body:
  grant_type=urn:ietf:params:oauth:grant-type:user_code
  client_id=78257093-7e40-4613-99e0-527b14b39113
  user_code=ABCD-1234
  code_verifier=<original_verifier>
```

Poll every `interval` ms. Possible responses:

| Status | Meaning |
|--------|---------|
| `status: "pending"` | User hasn't authorized yet → retry |
| `status: "error"` | Authorization denied → abort |
| `status: "success"` | Tokens received → proceed |

Success response:
```json
{
  "status": "success",
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "rt_abc123def...",
  "expired_in": 3600000,
  "resource_url": "https://api.minimax.io",
  "notification_message": "optional note"
}
```

### Expiry Resolution Logic

MiniMax's `expired_in` field is ambiguous — it can be either:

1. **Unix milliseconds** (absolute timestamp) — if `value > now_ms / 2`
2. **TTL seconds** (relative duration) — fallback

```typescript
function resolveExpiryUnix(expiredIn: number): number {
  const nowMs = Date.now();
  const raw = Math.floor(expiredIn);
  if (raw > nowMs / 2) {
    return raw / 1000;  // unix ms → unix seconds
  }
  return nowMs / 1000 + Math.max(1, raw);  // TTL seconds
}
```

---

## Database Schema

### Entity Relationship Diagram

```
┌────────────────────────────┐       ┌──────────────────────────────┐
│        users               │       │      oauth_tokens             │
├────────────────────────────┤       ├──────────────────────────────┤
│ id           UUID     PK   │──┐    │ id                UUID   PK  │
│ email        text          │  │    │ provider_id       UUID   FK  │──▶ providers
│ name         text          │  │    │ user_id           UUID   FK  │──▶ users
│ created_at   timestamptz   │  │    │ access_token      text       │
│ updated_at   timestamptz   │  │    │ refresh_token     text       │
└────────────────────────────┘  │    │ token_type        text       │
                                │    │ scope             text       │
┌────────────────────────────┐  │    │ expires_at        timestamptz│
│     oauth_providers        │  │    │ obtained_at       timestamptz│
├────────────────────────────┤  │    │ last_error        jsonb      │
│ id                UUID PK │◄─┘    │ created_at        timestamptz│
│ user_id           UUID FK │──────▶│ updated_at        timestamptz│
│ provider_id       text    │       └──────────────────────────────┘
│ region            text    │
│ portal_base_url   text    │       ┌──────────────────────────────┐
│ inference_base_url text   │       │   inference_sessions         │
│ client_id         text    │       ├──────────────────────────────┤
│ scope             text    │       │ id                UUID   PK  │
│ resource_url      text    │       │ user_id           UUID   FK  │
│ is_active         boolean │       │ provider_id       UUID   FK  │
│ created_at        timestamptz│    │ model              text      │
│ updated_at        timestamptz│    │ started_at         timestamptz│
└────────────────────────────┘       │ ended_at           timestamptz│
                                     │ token_expired      boolean   │
                                     └──────────────────────────────┘
```

### Drizzle Schema

```typescript
// db/schema.ts
import { pgTable, uuid, text, timestamp, boolean, jsonb, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

// ─── Users ───────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  oauthProviders: many(oauthProviders),
  oauthTokens: many(oauthTokens),
  inferenceSessions: many(inferenceSessions),
}));

// ─── OAuth Providers ─────────────────────────────────────────────

export const oauthProviders = pgTable("oauth_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull(),     // e.g. "minimax-oauth"
  region: text("region").notNull().default("global"),  // "global" | "cn"
  portalBaseUrl: text("portal_base_url").notNull(),
  inferenceBaseUrl: text("inference_base_url").notNull(),
  clientId: text("client_id").notNull(),
  scope: text("scope").notNull(),
  resourceUrl: text("resource_url"),
  isActive: boolean("is_active").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const oauthProvidersRelations = relations(oauthProviders, ({ one, many }) => ({
  user: one(users, {
    fields: [oauthProviders.userId],
    references: [users.id],
  }),
  tokens: many(oauthTokens),
  inferenceSessions: many(inferenceSessions),
}));

// ─── OAuth Tokens ────────────────────────────────────────────────

export const oauthTokens = pgTable("oauth_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => oauthProviders.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenType: text("token_type").notNull().default("Bearer"),
  scope: text("scope").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  obtainedAt: timestamp("obtained_at", { withTimezone: true }).defaultNow().notNull(),
  lastError: jsonb("last_error").$type<{
    code: string;
    message: string;
    reason: string;
    reloginRequired: boolean;
    at: string;
  } | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const oauthTokensRelations = relations(oauthTokens, ({ one }) => ({
  provider: one(oauthProviders, {
    fields: [oauthTokens.providerId],
    references: [oauthProviders.id],
  }),
  user: one(users, {
    fields: [oauthTokens.userId],
    references: [users.id],
  }),
}));

// ─── Inference Sessions ──────────────────────────────────────────

export const inferenceSessions = pgTable("inference_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => oauthProviders.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  tokenExpired: boolean("token_expired").default(false),
});

export const inferenceSessionsRelations = relations(inferenceSessions, ({ one }) => ({
  user: one(users, {
    fields: [inferenceSessions.userId],
    references: [users.id],
  }),
  provider: one(oauthProviders, {
    fields: [inferenceSessions.providerId],
    references: [oauthProviders.id],
  }),
}));
```

### Migration

```typescript
// db/migrate.ts
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
// For PostgreSQL:
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./db";

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migration complete.");
  process.exit(0);
}

main().catch(console.error);
```

```bash
# Generate migration
bunx drizzle-kit generate

# Apply
bun run db:migrate
```

---

## Zod Schemas

```typescript
// schemas/oauth.ts
import { z } from "zod";

// ─── User Schema ─────────────────────────────────────────────────

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100).optional(),
});

export const userSchema = createUserSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ─── OAuth Provider Schemas ──────────────────────────────────────

export const createProviderSchema = z.object({
  providerId: z.literal("minimax-oauth"),
  region: z.enum(["global", "cn"]).default("global"),
  portalBaseUrl: z.string().url().optional(),
  inferenceBaseUrl: z.string().url().optional(),
  scope: z.string().optional(),
});

export const providerSchema = createProviderSchema.extend({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  clientId: z.string(),
  resourceUrl: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ─── Token Schemas ───────────────────────────────────────────────

export const tokenPayloadSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.string().default("Bearer"),
  scope: z.string().optional(),
  resource_url: z.string().optional(),
  notification_message: z.string().optional(),
});

export type TokenPayload = z.infer<typeof tokenPayloadSchema>;

export const persistTokenSchema = z.object({
  providerId: z.string().uuid(),
  userId: z.string().uuid(),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  tokenType: z.string().default("Bearer"),
  scope: z.string(),
  expiresAt: z.string().datetime(),
  obtainedAt: z.string().datetime().optional(),
});

export const tokenRecordSchema = persistTokenSchema.extend({
  id: z.string().uuid(),
  lastError: z
    .object({
      code: z.string(),
      message: z.string(),
      reason: z.string(),
      reloginRequired: z.boolean(),
      at: z.string().datetime(),
    })
    .nullable()
    .optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type PersistToken = z.infer<typeof persistTokenSchema>;
export type TokenRecord = z.infer<typeof tokenRecordSchema>;

// ─── MiniMax OAuth Responses ─────────────────────────────────────

export const userCodeResponseSchema = z.object({
  user_code: z.string().min(1),
  verification_uri: z.string().url(),
  expired_in: z.number().int().positive(),
  interval: z.number().int().positive().optional(),
  state: z.string(),
});

export type UserCodeResponse = z.infer<typeof userCodeResponseSchema>;

export const tokenResponseSchema = z.object({
  status: z.enum(["success", "pending", "error"]),
  access_token: z.string().min(1).optional(),
  refresh_token: z.string().min(1).optional(),
  expired_in: z.number().int().positive().optional(),
  resource_url: z.string().optional(),
  notification_message: z.string().optional(),
});

export type TokenResponse = z.infer<typeof tokenResponseSchema>;

// ─── Login Request / Response ────────────────────────────────────

export const startLoginSchema = z.object({
  region: z.enum(["global", "cn"]).default("global"),
});

export const startLoginResponseSchema = z.object({
  userCode: z.string(),
  verificationUri: z.string(),
  expiredIn: z.number(),
  intervalMs: z.number(),
  pkceState: z.string(),
  providerId: z.string().uuid(),
});

export type StartLoginResponse = z.infer<typeof startLoginResponseSchema>;

// ─── Runtime Credentials ─────────────────────────────────────────

export const runtimeCredentialsSchema = z.object({
  provider: z.string(),
  apiKey: z.union([z.string(), z.function()]),
  baseUrl: z.string().url(),
  source: z.literal("oauth"),
});

export type RuntimeCredentials = z.infer<typeof runtimeCredentialsSchema>;

// ─── Auth Status ─────────────────────────────────────────────────

export const authStatusSchema = z.object({
  loggedIn: z.boolean(),
  provider: z.string().optional(),
  region: z.string().optional(),
  expiresAt: z.string().datetime().nullable(),
  hasRefreshToken: z.boolean().optional(),
  lastError: z.string().nullable(),
});

export type AuthStatus = z.infer<typeof authStatusSchema>;

// ─── Error ───────────────────────────────────────────────────────

export class AuthError extends Error {
  readonly provider: string;
  readonly code: string;
  readonly reloginRequired: boolean;
  readonly statusCode: number;

  constructor(
    message: string,
    opts: {
      provider?: string;
      code?: string;
      reloginRequired?: boolean;
      statusCode?: number;
    } = {}
  ) {
    super(message);
    this.name = "AuthError";
    this.provider = opts.provider ?? "unknown";
    this.code = opts.code ?? "unknown";
    this.reloginRequired = opts.reloginRequired ?? false;
    this.statusCode = opts.statusCode ?? 500;
  }
}
```

---

## Auth Store — Repository Layer

```typescript
// db/repositories/auth-repository.ts
import { eq, and, desc, lt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  oauthProviders,
  oauthTokens,
  inferenceSessions,
  type UserSchema,
  type ProviderSchema,
  type TokenRecord,
} from "../schema";
import { AuthError } from "../../schemas/oauth";

// ─── Users ───────────────────────────────────────────────────────

export async function createUser(email: string, name?: string) {
  const [user] = await db
    .insert(users)
    .values({ email, name: name ?? null })
    .returning();
  return user;
}

export async function getUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
}

export async function getUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user ?? null;
}

// ─── OAuth Providers ─────────────────────────────────────────────

export async function createOAuthProvider(input: {
  userId: string;
  providerId: string;
  region: string;
  portalBaseUrl: string;
  inferenceBaseUrl: string;
  clientId: string;
  scope: string;
  resourceUrl?: string;
}) {
  const [provider] = await db
    .insert(oauthProviders)
    .values({
      ...input,
      resourceUrl: input.resourceUrl ?? null,
      isActive: true,
    })
    .returning();
  return provider;
}

export async function getActiveProviderByUserId(
  userId: string,
  providerId: string
) {
  const [provider] = await db
    .select()
    .from(oauthProviders)
    .where(
      and(
        eq(oauthProviders.userId, userId),
        eq(oauthProviders.providerId, providerId),
        eq(oauthProviders.isActive, true)
      )
    );
  return provider ?? null;
}

export async function deactivateProvider(id: string) {
  await db
    .update(oauthProviders)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(oauthProviders.id, id));
}

export async function updateProviderResourceUrl(id: string, resourceUrl: string) {
  await db
    .update(oauthProviders)
    .set({ resourceUrl, updatedAt: new Date() })
    .where(eq(oauthProviders.id, id));
}

// ─── OAuth Tokens ────────────────────────────────────────────────

export async function saveTokens(input: {
  providerId: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  scope: string;
  expiresAt: Date;
}) {
  // Deactivate any existing tokens for this provider
  await db
    .delete(oauthTokens)
    .where(
      and(
        eq(oauthTokens.providerId, input.providerId),
        eq(oauthTokens.userId, input.userId)
      )
    );

  const [token] = await db
    .insert(oauthTokens)
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

export async function getLatestToken(
  providerId: string,
  userId: string
): Promise<TokenRecord | null> {
  const [token] = await db
    .select()
    .from(oauthTokens)
    .where(
      and(
        eq(oauthTokens.providerId, providerId),
        eq(oauthTokens.userId, userId)
      )
    )
    .orderBy(desc(oauthTokens.createdAt))
    .limit(1);
  return (token as TokenRecord) ?? null;
}

export async function updateToken(providerId: string, userId: string, data: {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
}) {
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.accessToken) updateData.accessToken = data.accessToken;
  if (data.refreshToken) updateData.refreshToken = data.refreshToken;
  if (data.expiresAt) updateData.expiresAt = data.expiresAt;

  await db
    .update(oauthTokens)
    .set(updateData)
    .where(
      and(
        eq(oauthTokens.providerId, providerId),
        eq(oauthTokens.userId, userId)
      )
    );
}

export async function quarantineTokens(
  providerId: string,
  userId: string,
  error: AuthError
) {
  await db
    .update(oauthTokens)
    .set({
      lastError: {
        code: error.code,
        message: error.message,
        reason: "runtime_refresh_failure",
        reloginRequired: true,
        at: new Date().toISOString(),
      },
      accessToken: null,
      refreshToken: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(oauthTokens.providerId, providerId),
        eq(oauthTokens.userId, userId)
      )
    );
}

export async function getExpiringTokens(skewSeconds: number) {
  const skewInterval = sql`INTERVAL '${sql.raw(String(skewSeconds))} seconds'`;
  return db
    .select()
    .from(oauthTokens)
    .where(
      lt(
        oauthTokens.expiresAt,
        sql`NOW() + ${skewInterval}`
      )
    );
}

// ─── Auth Status ─────────────────────────────────────────────────

export async function getAuthStatus(
  userId: string,
  providerId: string
): Promise<{
  loggedIn: boolean;
  provider?: string;
  region?: string;
  expiresAt: string | null;
  hasRefreshToken: boolean;
  lastError: string | null;
}> {
  const provider = await getActiveProviderByUserId(userId, providerId);
  if (!provider) {
    return { loggedIn: false, expiresAt: null, hasRefreshToken: false, lastError: null };
  }

  const token = await getLatestToken(provider.id, userId);
  if (!token || !token.accessToken) {
    return {
      loggedIn: false,
      provider: providerId,
      region: provider.region,
      expiresAt: null,
      hasRefreshToken: false,
      lastError: token?.lastError?.message ?? null,
    };
  }

  return {
    loggedIn: token.expiresAt > new Date(),
    provider: providerId,
    region: provider.region,
    expiresAt: token.expiresAt.toISOString(),
    hasRefreshToken: !!token.refreshToken,
    lastError: token.lastError?.message ?? null,
  };
}

// ─── Inference Sessions ──────────────────────────────────────────

export async function startInferenceSession(
  userId: string,
  providerId: string,
  model: string
) {
  const [session] = await db
    .insert(inferenceSessions)
    .values({ userId, providerId, model })
    .returning();
  return session;
}

export async function endInferenceSession(id: string, tokenExpired = false) {
  await db
    .update(inferenceSessions)
    .set({ endedAt: new Date(), tokenExpired })
    .where(eq(inferenceSessions.id, id));
}
```

---

## MiniMax OAuth Client

```typescript
// lib/minimax-oauth.ts
import crypto from "crypto";

import { AuthError } from "../schemas/oauth";
import { getActiveProviderByUserId, getLatestToken, saveTokens, updateToken, quarantineTokens } from "../db/repositories/auth-repository";

// ─── Constants ──────────────────────────────────────────────────

const MINIMAX_OAUTH_CLIENT_ID = "78257093-7e40-4613-99e0-527b14b39113";
const MINIMAX_OAUTH_SCOPE = "group_id profile model.completion";
const MINIMAX_OAUTH_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:user_code";
const MINIMAX_OAUTH_GLOBAL_BASE = "https://api.minimax.io";
const MINIMAX_OAUTH_CN_BASE = "https://api.minimaxi.com";
const MINIMAX_OAUTH_GLOBAL_INFERENCE = "https://api.minimax.io/anthropic";
const MINIMAX_OAUTH_CN_INFERENCE = "https://api.minimaxi.com/anthropic";
const MINIMAX_OAUTH_REFRESH_SKEW_SECONDS = 60;

export class MiniMaxOAuthClient {
  readonly clientId = MINIMAX_OAUTH_CLIENT_ID;
  readonly scope = MINIMAX_OAUTH_SCOPE;
  readonly grantType = MINIMAX_OAUTH_GRANT_TYPE;

  getPortalBase(region: string): string {
    return region === "cn" ? MINIMAX_OAUTH_CN_BASE : MINIMAX_OAUTH_GLOBAL_BASE;
  }

  getInferenceBase(region: string): string {
    return region === "cn" ? MINIMAX_OAUTH_CN_INFERENCE : MINIMAX_OAUTH_GLOBAL_INFERENCE;
  }

  // ─── PKCE ───────────────────────────────────────────────────

  generatePKCE(): { codeVerifier: string; codeChallenge: string; state: string } {
    const codeVerifier = crypto.randomBytes(48).toString("base64url").slice(0, 96);
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest()
      .toString("base64url");
    const state = crypto.randomBytes(16).toString("base64url");
    return { codeVerifier, codeChallenge, state };
  }

  // ─── Expiry Resolution ──────────────────────────────────────

  resolveExpiryUnix(expiredIn: number): number {
    const nowMs = Date.now();
    const raw = Math.floor(expiredIn);
    if (raw > nowMs / 2) {
      return raw / 1000;  // unix ms → unix seconds
    }
    return nowMs / 1000 + Math.max(1, raw);  // TTL seconds
  }

  // ─── Step 1: Request User Code ──────────────────────────────

  async requestUserCode(opts: {
    portalBaseUrl: string;
    codeChallenge: string;
    state: string;
  }): Promise<{
    userCode: string;
    verificationUri: string;
    expiredIn: number;
    intervalMs: number;
  }> {
    const response = await fetch(`${opts.portalBaseUrl}/oauth/code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "x-request-id": crypto.randomUUID(),
      },
      body: new URLSearchParams({
        response_type: "code",
        client_id: this.clientId,
        scope: this.scope,
        code_challenge: opts.codeChallenge,
        code_challenge_method: "S256",
        state: opts.state,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new AuthError(
        `MiniMax /oauth/code failed (${response.status}): ${text || response.statusText}`,
        { provider: "minimax-oauth", code: "authorization_failed", statusCode: response.status }
      );
    }

    const payload = await response.json();

    // Validate state (CSRF protection)
    if (payload.state !== opts.state) {
      throw new AuthError(
        "MiniMax state mismatch (possible CSRF).",
        { provider: "minimax-oauth", code: "state_mismatch" }
      );
    }

    return {
      userCode: String(payload.user_code),
      verificationUri: String(payload.verification_uri),
      expiredIn: Number(payload.expired_in),
      intervalMs: Number(payload.interval ?? 2000),
    };
  }

  // ─── Step 2: Poll for Token ─────────────────────────────────

  async pollToken(opts: {
    portalBaseUrl: string;
    userCode: string;
    codeVerifier: string;
    expiredIn: number;
    intervalMs: number | null;
    signal?: AbortSignal;
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    expiredIn: number;
    resourceUrl?: string;
    notificationMessage?: string;
  }> {
    const nowMs = Date.now();
    const raw = Math.floor(opts.expiredIn);
    let deadline: number;

    if (raw > nowMs / 2) {
      deadline = raw / 1000;  // unix ms → seconds
    } else {
      deadline = nowMs / 1000 + Math.max(1, raw);  // TTL seconds
    }

    const interval = Math.max(2.0, (opts.intervalMs ?? 2000) / 1000.0);

    while (Date.now() / 1000 < deadline) {
      const response = await fetch(`${opts.portalBaseUrl}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: this.grantType,
          client_id: this.clientId,
          user_code: opts.userCode,
          code_verifier: opts.codeVerifier,
        }),
        signal: opts.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new AuthError(
          `MiniMax /oauth/token failed (${response.status}): ${text || response.statusText}`,
          { provider: "minimax-oauth", code: "token_exchange_failed", statusCode: response.status }
        );
      }

      const payload = await response.json();
      const status = String(payload.status ?? "pending");

      if (status === "error") {
        throw new AuthError(
          "MiniMax OAuth reported an error.",
          { provider: "minimax-oauth", code: "authorization_denied" }
        );
      }

      if (status === "success") {
        const accessToken = String(payload.access_token ?? "");
        const refreshToken = String(payload.refresh_token ?? "");
        const expiredIn = Number(payload.expired_in ?? 0);

        if (!accessToken || !refreshToken || !expiredIn) {
          throw new AuthError(
            "MiniMax success payload missing required token fields.",
            { provider: "minimax-oauth", code: "token_incomplete" }
          );
        }

        return {
          accessToken,
          refreshToken,
          expiredIn,
          resourceUrl: payload.resource_url ? String(payload.resource_url) : undefined,
          notificationMessage: payload.notification_message
            ? String(payload.notification_message) : undefined,
        };
      }

      // status === "pending" or unknown → wait and retry
      await new Promise(resolve => setTimeout(resolve, interval * 1000));
    }

    throw new AuthError(
      "MiniMax OAuth timed out before authorization completed.",
      { provider: "minimax-oauth", code: "timeout" }
    );
  }

  // ─── Step 3: Refresh Token ──────────────────────────────────

  async refreshToken(opts: {
    portalBaseUrl: string;
    clientId: string;
    refreshToken: string;
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    expiredIn: number;
  }> {
    const response = await fetch(`${opts.portalBaseUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: opts.clientId,
        refresh_token: opts.refreshToken,
      }),
    });

    if (!response.ok) {
      const text = await response.text().toLowerCase();
      const relogin = ["invalid_grant", "refresh_token_reused", "invalid_refresh_token"]
        .some(m => text.includes(m));
      throw new AuthError(
        `MiniMax token refresh failed (${response.status}): ${await response.text().catch(() => response.statusText)}`,
        { provider: "minimax-oauth", code: "refresh_failed", reloginRequired: relogin }
      );
    }

    const payload = await response.json();

    if (payload.status !== "success") {
      throw new AuthError(
        "MiniMax refresh did not return success.",
        { provider: "minimax-oauth", code: "refresh_failed", reloginRequired: true }
      );
    }

    return {
      accessToken: String(payload.access_token),
      refreshToken: String(payload.refresh_token ?? opts.refreshToken),
      expiredIn: Number(payload.expired_in ?? 0),
    };
  }

  // ─── COMPLETE FLOW: Login ───────────────────────────────────

  async login(opts: {
    userId: string;
    region?: string;
    signal?: AbortSignal;
  }): Promise<{
    userCode: string;
    verificationUri: string;
    intervalMs: number;
    providerRecordId: string;
    pollForToken: () => Promise<void>;
  }> {
    const region = opts.region ?? "global";
    const portalBaseUrl = this.getPortalBase(region);
    const inferenceBaseUrl = this.getInferenceBase(region);
    const { codeVerifier, codeChallenge, state } = this.generatePKCE();

    // Step 1: Request user code from MiniMax
    const codeData = await this.requestUserCode({
      portalBaseUrl,
      codeChallenge,
      state,
    });

    // Step 2: Create/upsert the provider record in PostgreSQL
    let provider = await getActiveProviderByUserId(opts.userId, "minimax-oauth");

    if (provider) {
      // Update existing provider config
      await dbUpdateProvider(provider.id, { region, portalBaseUrl, inferenceBaseUrl });
    } else {
      // Create new provider config
      provider = await createOAuthProvider({
        userId: opts.userId,
        providerId: "minimax-oauth",
        region,
        portalBaseUrl,
        inferenceBaseUrl,
        clientId: this.clientId,
        scope: this.scope,
      });
    }

    // Return user-facing data + a continuation function
    return {
      userCode: codeData.userCode,
      verificationUri: codeData.verificationUri,
      intervalMs: codeData.intervalMs,
      providerRecordId: provider.id,
      pollForToken: async () => {
        const tokens = await this.pollToken({
          portalBaseUrl,
          userCode: codeData.userCode,
          codeVerifier,
          expiredIn: codeData.expiredIn,
          intervalMs: codeData.intervalMs,
          signal: opts.signal,
        });

        const now = new Date();
        const expiresAtUnix = this.resolveExpiryUnix(tokens.expiredIn);
        const expiresAt = new Date(expiresAtUnix * 1000);

        // Persist tokens to PostgreSQL
        await saveTokens({
          providerId: provider.id,
          userId: opts.userId,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenType: "Bearer",
          scope: this.scope,
          expiresAt,
        });

        // Update provider resource_url if present
        if (tokens.resourceUrl) {
          await updateProviderResourceUrl(provider.id, tokens.resourceUrl);
        }
      },
    };
  }

  // ─── Token Refresh ──────────────────────────────────────────

  async ensureFreshToken(
    userId: string,
    providerRecordId: string
  ): Promise<string> {
    const token = await getLatestToken(providerRecordId, userId);

    if (!token || !token.accessToken) {
      throw new AuthError(
        "Not logged into MiniMax OAuth.",
        { provider: "minimax-oauth", code: "not_logged_in", reloginRequired: true }
      );
    }

    // Check if refresh is needed (token expiring within skew window)
    const refreshSkewMs = MINIMAX_OAUTH_REFRESH_SKEW_SECONDS * 1000;
    if (token.expiresAt.getTime() - Date.now() > refreshSkewMs) {
      return token.accessToken;  // Still valid
    }

    if (!token.refreshToken) {
      throw new AuthError(
        "MiniMax OAuth state has no refresh_token; please re-login.",
        { provider: "minimax-oauth", code: "no_refresh_token", reloginRequired: true }
      );
    }

    // Fetch portal base URL from provider record
    const provider = await dbGetProvider(providerRecordId);
    if (!provider) {
      throw new AuthError("Provider record not found.", { code: "provider_not_found" });
    }

    try {
      const refreshed = await this.refreshToken({
        portalBaseUrl: provider.portalBaseUrl,
        clientId: provider.clientId,
        refreshToken: token.refreshToken,
      });

      await updateToken(providerRecordId, userId, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: new Date(this.resolveExpiryUnix(refreshed.expiredIn) * 1000),
      });

      return refreshed.accessToken;
    } catch (error) {
      if (error instanceof AuthError && error.reloginRequired) {
        await quarantineTokens(providerRecordId, userId, error);
      }
      throw error;
    }
  }
}

// Helpers (would be imported from repository)
async function dbGetProvider(id: string) {
  const { db } = await import("../db/db");
  const { eq } = await import("drizzle-orm");
  const { oauthProviders } = await import("../db/schema");
  const [p] = await db.select().from(oauthProviders).where(eq(oauthProviders.id, id));
  return p ?? null;
}

async function dbUpdateProvider(id: string, data: Record<string, unknown>) {
  const { db } = await import("../db/db");
  const { eq } = await import("drizzle-orm");
  const { oauthProviders } = await import("../db/schema");

  await db
    .update(oauthProviders)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(oauthProviders.id, id));
}
```

---

## Hono API Routes

```typescript
// routes/auth.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { MiniMaxOAuthClient } from "../lib/minimax-oauth";
import {
  createUserSchema,
  startLoginSchema,
  authStatusSchema,
  AuthError,
} from "../schemas/oauth";
import { getUserByEmail, createUser, getAuthStatus } from "../db/repositories/auth-repository";

const app = new Hono();
const minimax = new MiniMaxOAuthClient();

// ─── Middleware: resolve user ─────────────────────────────────

// In production, this would extract from session/JWT cookie.
// For this example, we accept X-User-Id or X-User-Email header.
async function resolveUser(c: any) {
  const userId = c.req.header("X-User-Id");
  if (userId) {
    return userId;
  }

  const email = c.req.header("X-User-Email");
  if (email) {
    let user = await getUserByEmail(email);
    if (!user) {
      user = await createUser(email);
    }
    return user.id;
  }

  throw new AuthError("User identification required", { statusCode: 401 });
}

function wrapHandler(fn: (c: any) => Promise<Response>) {
  return async (c: any) => {
    try {
      return await fn(c);
    } catch (error) {
      if (error instanceof AuthError) {
        return c.json(
          {
            error: error.code,
            message: error.message,
            reloginRequired: error.reloginRequired,
          },
          error.statusCode
        );
      }
      console.error("Unexpected error:", error);
      return c.json({ error: "internal_error", message: "An unexpected error occurred." }, 500);
    }
  };
}

// ─── POST /auth/minimax/start ────────────────────────────────

app.post(
  "/auth/minimax/start",
  zValidator("json", startLoginSchema),
  zValidator("header", z.object({
    "x-user-id": z.string().uuid().optional(),
    "x-user-email": z.string().email().optional(),
  })),
  wrapHandler(async (c) => {
    const userId = await resolveUser(c);
    const { region } = c.req.valid("json");
    const signal = c.req.raw.signal;

    const result = await minimax.login({ userId, region, signal });

    return c.json({
      userCode: result.userCode,
      verificationUri: result.verificationUri,
      intervalMs: result.intervalMs,
      providerId: result.providerRecordId,
      pollUrl: `POST /auth/minimax/${result.providerRecordId}/poll`,
    });
  })
);

// ─── POST /auth/minimax/:providerId/poll ─────────────────────

app.post(
  "/auth/minimax/:providerId/poll",
  zValidator("header", z.object({
    "x-user-id": z.string().uuid().optional(),
    "x-user-email": z.string().email().optional(),
  })),
  wrapHandler(async (c) => {
    const userId = await resolveUser(c);
    const providerId = c.req.param("providerId");

    // Fetch the saved PKCE state from a temporary store.
    // The `login()` already created the provider record.
    // The poll continuation was returned but we need to run it.
    // In practice, store the continuation or PKCE params
    // in a side table (oauth_pending_flows).

    // For simplicity, we re-issue a full login but skip
    // the user-code request since it's already in-flight.
    // A better approach: store (providerId, verifier, portalBase)
    // in a pending_flows table when start is called.

    return c.json({
      message: "Poll the MiniMax server by calling pollForToken(). " +
        "In a real implementation, a background job would poll " +
        "and update the database on success.",
      providerId,
    });
  })
);

// ─── GET /auth/minimax/status ─────────────────────────────────

app.get(
  "/auth/minimax/status",
  zValidator("header", z.object({
    "x-user-id": z.string().uuid().optional(),
    "x-user-email": z.string().email().optional(),
  })),
  wrapHandler(async (c) => {
    const userId = await resolveUser(c);

    const status = await getAuthStatus(userId, "minimax-oauth");

    return c.json(status);
  })
);

// ─── POST /auth/minimax/refresh ───────────────────────────────

app.post(
  "/auth/minimax/refresh",
  zValidator("header", z.object({
    "x-user-id": z.string().uuid().optional(),
    "x-user-email": z.string().email().optional(),
  })),
  zValidator("json", z.object({
    force: z.boolean().optional(),
  })),
  wrapHandler(async (c) => {
    const userId = await resolveUser(c);

    const provider = await getActiveProviderByUserId(userId, "minimax-oauth");
    if (!provider) {
      return c.json({ error: "no_provider", message: "No MiniMax OAuth configured." }, 404);
    }

    const accessToken = await minimax.ensureFreshToken(userId, provider.id);

    return c.json({ accessToken: accessToken.slice(0, 12) + "..." });
  })
);

// ─── DELETE /auth/minimax ────────────────────────────────────

app.delete(
  "/auth/minimax",
  wrapHandler(async (c) => {
    const userId = await resolveUser(c);

    const { deactivateProvider } = await import("../db/repositories/auth-repository");
    const provider = await getActiveProviderByUserId(userId, "minimax-oauth");
    if (provider) {
      await deactivateProvider(provider.id);
    }

    return c.json({ message: "MiniMax OAuth deactivated." });
  })
);

export default app;

// server.ts — Entry point
import { Hono } from "hono";
import { cors } from "hono/cors";
import authRoutes from "./routes/auth";

const app = new Hono();

app.use("/*", cors());
app.route("/api", authRoutes);

app.get("/health", (c) => c.json({ status: "ok" }));

export default {
  port: 3000,
  fetch: app.fetch,
};
```

---

## Token Provider Pattern

For long-lived sessions (gateway, cron), MiniMax uses a callable token provider:

```typescript
// lib/token-provider.ts
import { MiniMaxOAuthClient } from "./minimax-oauth";
import { getActiveProviderByUserId } from "../db/repositories/auth-repository";

export type TokenProvider = () => Promise<string>;

export function buildMinimaxTokenProvider(
  userId: string,
  client?: MiniMaxOAuthClient
): TokenProvider {
  const minimax = client ?? new MiniMaxOAuthClient();

  return async (): Promise<string> => {
    const provider = await getActiveProviderByUserId(userId, "minimax-oauth");
    if (!provider) {
      throw new Error("No MiniMax OAuth provider configured. Run OAuth login first.");
    }

    return minimax.ensureFreshToken(userId, provider.id);
  };
}
```

**Usage with Anthropic SDK:**

```typescript
// When the SDK calls apiKey, it gets a fresh token each time.
const tokenProvider = buildMinimaxTokenProvider(userId);

const response = await fetch("https://api.minimax.io/anthropic/v1/messages", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${await tokenProvider()}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ model: "MiniMax-M2.7", messages: [...] }),
});
```

---

## Quarantine Pattern

```typescript
// lib/quarantine.ts
import { quarantineTokens } from "../db/repositories/auth-repository";
import { AuthError } from "../schemas/oauth";

/**
 * When a refresh fails with a terminal error (invalid_grant,
 * token revoked, refresh_token_reused):
 *
 * 1. Wipe dead tokens from the database
 * 2. Record last_auth_error in the tokens row
 * 3. Subsequent calls see no valid tokens → fail fast
 *    with a "please re-login" error instead of retrying
 *    the dead refresh token.
 */
export async function handleTerminalRefreshError(
  providerId: string,
  userId: string,
  error: AuthError
): Promise<void> {
  if (!error.reloginRequired) return;

  console.error(
    `[Quarantine] Terminal refresh error for ${providerId}/${userId}: ${error.code} — ${error.message}`
  );

  await quarantineTokens(providerId, userId, error);
}
```

**Detection helpers for terminal errors:**

```typescript
export function isTerminalRefreshError(error: AuthError): boolean {
  if (error.provider !== "minimax-oauth") return false;
  return (
    error.code === "refresh_failed" ||
    error.code === "no_refresh_token"
  ) && error.reloginRequired;
}
```

---

## Project Setup

```bash
# ─── Create project ──────────────────────────────────────────
mkdir minimax-oauth-service
cd minimax-oauth-service
bun init -y

# ─── Install dependencies ────────────────────────────────────
bun add hono drizzle-orm postgres @hono/zod-validator zod
bun add -D drizzle-kit @types/node

# ─── Directory structure ─────────────────────────────────────
mkdir -p db lib routes schemas

# Files:
#   db/db.ts          — Drizzle client init
#   db/schema.ts      — Drizzle table definitions
#   db/migrate.ts     — Migration runner
#   db/repositories/auth-repository.ts  — Data access
#   schemas/oauth.ts  — Zod schemas + AuthError
#   lib/minimax-oauth.ts  — OAuth client
#   lib/token-provider.ts  — Token provider pattern
#   lib/quarantine.ts      — Quarantine pattern
#   routes/auth.ts    — Hono API routes
#   server.ts         — Entry point
```

### db/db.ts

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://localhost:5432/hermes_auth",
});

export const db = drizzle(pool);
export { pool };
```

### drizzle.config.ts

```typescript
import type { Config } from "drizzle-kit";

export default {
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://localhost:5432/hermes_auth",
  },
} satisfies Config;
```

### package.json

```json
{
  "name": "minimax-oauth-service",
  "module": "server.ts",
  "type": "module",
  "scripts": {
    "dev": "bun --watch server.ts",
    "start": "bun server.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "bun run db/migrate.ts",
    "db:push": "drizzle-kit push"
  },
  "dependencies": {
    "drizzle-orm": "^0.36.0",
    "hono": "^4.6.0",
    "@hono/zod-validator": "^0.4.0",
    "zod": "^3.23.0",
    "postgres": "^3.4.0",
    "pg": "^8.13.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.28.0",
    "@types/node": "^22.0.0",
    "@types/pg": "^8.11.0"
  }
}
```

### Key API Endpoints

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `POST` | `/api/auth/minimax/start` | Start MiniMax OAuth login | `{userCode, verificationUri, intervalMs, providerId}` |
| `POST` | `/api/auth/minimax/:id/poll` | Poll for completed auth | `{status: "pending" | "success"}` |
| `GET` | `/api/auth/minimax/status` | Current auth status | `{loggedIn, expiresAt, hasRefreshToken, lastError}` |
| `POST` | `/api/auth/minimax/refresh` | Force token refresh | `{accessToken}` |
| `DELETE` | `/api/auth/minimax` | Deactivate OAuth | `{message}` |

### Environment Variables

```bash
DATABASE_URL=postgres://localhost:5432/hermes_auth
PORT=3000
# No API keys needed — MiniMax uses OAuth user-code flow
```

### Complete Flow Sequence (API)

```
POST /api/auth/minimax/start
  Headers: X-User-Email: user@example.com
  Body: { region: "global" }
  → {
      userCode: "ABCD-1234",
      verificationUri: "https://api.minimax.io/authorize?...",
      intervalMs: 2000,
      providerId: "<uuid>",
      pollUrl: "POST /api/auth/minimax/<uuid>/poll"
    }

User opens verificationUri in browser, enters userCode.

Client polls:
  POST /api/auth/minimax/<uuid>/poll
  (Eventually the backend's background polling completes)

Check status:
  GET /api/auth/minimax/status
  → { loggedIn: true, expiresAt: "2025-01-15T13:00:00Z",
      hasRefreshToken: true, lastError: null }

Use inference:
  fetch("https://api.minimax.io/anthropic/v1/messages", {
    headers: { Authorization: "Bearer <access_token>" }
  })
```