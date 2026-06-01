# API Gateway — OAuth Provider System

**Project:** `/home/imanpr33t/Documents/api-gateway/`
**Stack:** Bun + Hono + Drizzle ORM + PostgreSQL + Zod
**Patterns from:** `ts-provider-oauth` + Hermes Agent Python

## File Inventory

```
src/
├── types/
│   └── providers.ts          NEW — AuthType, ApiMode, ProviderProfile, OAuthAuthState
├── providers/
│   ├── registry.ts           NEW — provider profiles + lookup
│   ├── aliases.ts            NEW — 50+ aliases (grok→xai)
│   └── overlays.ts           NEW — transport mode, aggregator flags
├── auth/
│   ├── jwt-utils.ts          NEW — JWT claim decode + expiry detection
│   ├── user-store.ts         NEW — user + API key CRUD with SHA-256 hashing
│   ├── login-session.ts      NEW — two-phase login sessions + background polling
│   ├── credential-sources.ts  NEW — env seeding + source suppression
│   ├── credential-sanitization.ts  NEW — fingerprint borrowed secrets
│   ├── credential-pool.ts    NEW — pool with strategies, exhaustion, refresh
│   ├── quarantine.ts         NEW — terminal error detection + credential wipe
│   └── provider-resolver.ts  NEW — auto-detect provider from env
├── oauth/
│   ├── store.ts              NEW — OAuth token persistence (DB + file fallback)
│   ├── user-code.ts          NEW — MiniMax user_code OAuth flow
│   ├── device-code.ts        NEW — Nous Device Authorization Grant flow
│   ├── pkce-loopback.ts      NEW — xAI PKCE loopback flow
│   ├── external.ts           NEW — External process flow (Codex, Qwen)
│   └── index.ts              NEW — OAuth provider registry + dispatch
├── middleware/
│   └── api-key-auth.ts       NEW — Bearer token auth + user resolution
├── lib/
│   ├── openai-error.ts       NEW — OpenAI-compatible error format builder
│   └── http-client.ts        NEW — HTTP request helpers for OAuth
├── routes/
│   ├── auth.ts               NEW — multi-provider login/refresh/logout
│   ├── login.ts              NEW — two-phase login start/status
│   └── user.ts               NEW — signup/verify/API key management
└── index.ts                  MODIFY — register new routes
```

---

# ── src/types/providers.ts ──────────────────────────────────────

```typescript
/**
 * Provider Types — AuthType, ApiMode, ProviderProfile, OAuth types.
 * Single source of truth inferred via z.infer.
 */

import { z } from "zod";

// ─── Auth Types ───────────────────────────────────────────────────

export const AuthType = z.enum([
  "api_key",
  "oauth_device_code",
  "oauth_authorization_code",
  "oauth_user_code",
  "oauth_external",
  "copilot",
  "external_process",
  "aws_sdk",
  "none",
]);
export type AuthType = z.infer<typeof AuthType>;

// ─── API Modes ────────────────────────────────────────────────────

export const ApiMode = z.enum([
  "chat_completions",
  "anthropic_messages",
  "codex_responses",
  "bedrock_converse",
]);
export type ApiMode = z.infer<typeof ApiMode>;

// ─── OAuth Flow Types ─────────────────────────────────────────────

export type OAuthFlowType =
  | "authorization_code"
  | "device_code"
  | "user_code"
  | "external_process"
  | "pkce_loopback";

// ─── Provider Profile ─────────────────────────────────────────────

export const ProviderProfileSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().default(""),
  description: z.string().default(""),
  authType: AuthType.default("api_key"),
  apiMode: ApiMode.default("chat_completions"),
  baseUrl: z.string().default(""),
  portalBaseUrl: z.string().optional(),
  inferenceBaseUrl: z.string().optional(),
  clientId: z.string().optional(),
  scope: z.string().optional(),
  signupUrl: z.string().optional(),
  envVars: z.array(z.string()).default([]),
  apiKeyEnvVar: z.string().optional(),
  defaultModel: z.string().optional(),
  supportsHealthCheck: z.boolean().default(true),
  aliases: z.array(z.string()).default([]),
});
export type ProviderProfile = z.infer<typeof ProviderProfileSchema>;

// ─── OAuth Auth State ─────────────────────────────────────────────

export interface OAuthAuthState {
  provider: string;
  portalBaseUrl: string;
  inferenceBaseUrl: string;
  clientId: string;
  scope: string;
  tokenType: string;
  accessToken: string;
  refreshToken?: string;
  region?: string;
  obtainedAt: string;
  expiresAt?: string;
  expiresIn: number;
  lastAuthError?: {
    provider: string;
    code: string;
    message: string;
    reason?: string;
    reloginRequired?: boolean;
    at: string;
  };
}

// ─── Auth Status ──────────────────────────────────────────────────

export interface AuthStatus {
  loggedIn: boolean;
  provider: string;
  region?: string;
  expiresAt?: string;
  authType: string;
  hasRefreshToken?: boolean;
  clientId?: string;
  scope?: string;
  apiBaseUrl?: string;
  error?: string;
}

// ─── Request Schemas ──────────────────────────────────────────────

export const AuthLoginRequestSchema = z.object({
  provider: z.string().min(1),
  region: z.string().optional(),
  openBrowser: z.boolean().default(true),
  timeoutSeconds: z.number().positive().optional(),
  manualPaste: z.boolean().optional(),
});
export type AuthLoginRequest = z.infer<typeof AuthLoginRequestSchema>;

export const AuthRefreshRequestSchema = z.object({
  provider: z.string().min(1),
});
export type AuthRefreshRequest = z.infer<typeof AuthRefreshRequestSchema>;

// ─── Auth Error ───────────────────────────────────────────────────

export class AuthError extends Error {
  public provider: string;
  public code: string;
  public reloginRequired: boolean;

  constructor(
    message: string,
    opts: { provider: string; code: string; reloginRequired?: boolean },
  ) {
    super(message);
    this.name = "AuthError";
    this.provider = opts.provider;
    this.code = opts.code;
    this.reloginRequired = opts.reloginRequired ?? false;
  }
}

// ─── OAuth Provider Config (existing DB row shape) ────────────────

export interface OAuthProviderConfig {
  id: string;
  userId: string;
  providerId: string;
  region: string;
  portalBaseUrl: string;
  inferenceBaseUrl: string;
  clientId: string;
  scope: string;
  resourceUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

---

# ── src/providers/registry.ts ──────────────────────────────────

```typescript
/**
 * Provider Registry — all known provider profiles with auth config.
 *
 * Each entry mirrors Hermes Agent's ProviderConfig dataclass.
 * OAuth providers have portalBaseUrl, clientId, scope for the OAuth flow.
 * API-key providers have apiKeyEnvVar for env detection.
 */

import type { ProviderProfile } from "../types/providers";

// ─── Provider Registry ────────────────────────────────────────────

export const PROVIDER_REGISTRY: Record<string, ProviderProfile> = {
  // ── Aggregators ───────────────────────────────────────────────
  openrouter: {
    name: "openrouter",
    displayName: "OpenRouter",
    description: "Multi-model aggregator with broad model selection",
    authType: "api_key",
    apiMode: "chat_completions",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnvVar: "OPENROUTER_API_KEY",
    envVars: ["OPENROUTER_API_KEY", "OPENAI_API_KEY"],
    signupUrl: "https://openrouter.ai/keys",
    aliases: ["open-router"],
  },
  "ai-gateway": {
    name: "ai-gateway",
    displayName: "AI Gateway (Vercel)",
    description: "Vercel AI Gateway — unified API for multiple providers",
    authType: "api_key",
    apiMode: "chat_completions",
    apiKeyEnvVar: "AI_GATEWAY_API_KEY",
    envVars: ["AI_GATEWAY_API_KEY"],
    aliases: ["vercel", "ai-gateway"],
  },

  // ── Direct API Providers ─────────────────────────────────────
  anthropic: {
    name: "anthropic",
    displayName: "Anthropic",
    description: "Anthropic Claude models via direct API",
    authType: "api_key",
    apiMode: "anthropic_messages",
    baseUrl: "https://api.anthropic.com/v1",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    envVars: ["ANTHROPIC_API_KEY"],
    signupUrl: "https://console.anthropic.com/",
    aliases: ["claude"],
  },
  "openai-api": {
    name: "openai-api",
    displayName: "OpenAI API",
    description: "OpenAI models via direct API key",
    authType: "api_key",
    apiMode: "chat_completions",
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnvVar: "OPENAI_API_KEY",
    envVars: ["OPENAI_API_KEY"],
    signupUrl: "https://platform.openai.com/api-keys",
  },
  deepseek: {
    name: "deepseek",
    displayName: "DeepSeek",
    description: "DeepSeek models via API",
    authType: "api_key",
    apiMode: "chat_completions",
    baseUrl: "https://api.deepseek.com/v1",
    apiKeyEnvVar: "DEEPSEEK_API_KEY",
    envVars: ["DEEPSEEK_API_KEY"],
    signupUrl: "https://platform.deepseek.com/api_keys",
    aliases: ["deep-seek", "ds"],
  },
  gemini: {
    name: "gemini",
    displayName: "Google Gemini",
    description: "Google Gemini models via API key",
    authType: "api_key",
    apiMode: "chat_completions",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyEnvVar: "GEMINI_API_KEY",
    envVars: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    signupUrl: "https://aistudio.google.com/apikey",
    aliases: ["google-gemini"],
  },
  huggingface: {
    name: "huggingface",
    displayName: "HuggingFace",
    description: "HuggingFace Inference API",
    authType: "api_key",
    apiMode: "chat_completions",
    baseUrl: "https://api-inference.huggingface.co/v1",
    apiKeyEnvVar: "HF_TOKEN",
    envVars: ["HF_TOKEN"],
    signupUrl: "https://huggingface.co/settings/tokens",
    aliases: ["hf"],
  },
  nvidia: {
    name: "nvidia",
    displayName: "NVIDIA NIM",
    description: "NVIDIA NIM API",
    authType: "api_key",
    apiMode: "chat_completions",
    baseUrl: "https://api.nvcf.nvidia.com/v1",
    apiKeyEnvVar: "NVIDIA_API_KEY",
    envVars: ["NVIDIA_API_KEY"],
    signupUrl: "https://build.nvidia.com/explore/discover",
  },
  xai: {
    name: "xai",
    displayName: "xAI / Grok",
    description: "xAI Grok models via API",
    authType: "api_key",
    apiMode: "chat_completions",
    baseUrl: "https://api.x.ai/v1",
    apiKeyEnvVar: "XAI_API_KEY",
    envVars: ["XAI_API_KEY"],
    signupUrl: "https://console.x.ai/",
    aliases: ["grok"],
  },

  // ── OAuth Providers ──────────────────────────────────────────
  "minimax-oauth": {
    name: "minimax-oauth",
    displayName: "MiniMax (OAuth)",
    description: "MiniMax OAuth — user_code grant with PKCE",
    authType: "oauth_user_code",
    apiMode: "anthropic_messages",
    portalBaseUrl: "https://api.minimax.io",
    inferenceBaseUrl: "https://api.minimax.io/anthropic",
    clientId: "78257093-7e40-4613-99e0-527b14b39113",
    scope: "group_id profile model.completion",
    signupUrl: "https://platform.minimax.io",
    aliases: ["minimax-oauth"],
  },
  nous: {
    name: "nous",
    displayName: "Nous Research",
    description: "Nous Portal — OAuth device code grant",
    authType: "oauth_device_code",
    apiMode: "chat_completions",
    portalBaseUrl: "https://portal.nousresearch.com",
    inferenceBaseUrl: "https://inference-api.nousresearch.com/v1",
    signupUrl: "https://portal.nousresearch.com",
    aliases: ["nous"],
  },
  "xai-oauth": {
    name: "xai-oauth",
    displayName: "xAI Grok (OAuth)",
    description: "xAI OAuth — PKCE loopback flow",
    authType: "oauth_authorization_code",
    apiMode: "codex_responses",
    portalBaseUrl: "https://auth.x.ai",
    inferenceBaseUrl: "https://api.x.ai/v1",
    signupUrl: "https://console.x.ai/",
    aliases: ["xai-oauth"],
  },
  "openai-codex": {
    name: "openai-codex",
    displayName: "OpenAI Codex CLI",
    description: "OpenAI Codex — external managed OAuth",
    authType: "oauth_external",
    apiMode: "codex_responses",
    portalBaseUrl: "https://chatgpt.com",
    inferenceBaseUrl: "https://api.openai.com/v1",
    signupUrl: "https://chatgpt.com",
    aliases: ["codex", "openai-codex"],
  },
  "qwen-oauth": {
    name: "qwen-oauth",
    displayName: "Qwen (OAuth)",
    description: "Alibaba Qwen — external CLI OAuth",
    authType: "oauth_external",
    apiMode: "chat_completions",
    portalBaseUrl: "https://portal.aliyun.com",
    inferenceBaseUrl: "https://dashscope.aliyuncs.com/v1",
    signupUrl: "https://portal.aliyun.com",
    aliases: ["qwen-oauth", "qwen-cli"],
  },
  "google-gemini-cli": {
    name: "google-gemini-cli",
    displayName: "Google Gemini CLI",
    description: "Google Gemini Code Assist — external CLI OAuth",
    authType: "oauth_external",
    apiMode: "chat_completions",
    portalBaseUrl: "https://cloud.google.com",
    inferenceBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    signupUrl: "https://cloud.google.com/code-assist",
    aliases: ["gemini-cli", "google-gemini-cli"],
  },

  // ── Copilot ──────────────────────────────────────────────────
  copilot: {
    name: "copilot",
    displayName: "GitHub Copilot",
    description: "GitHub Copilot — token-based auth",
    authType: "copilot",
    apiMode: "codex_responses",
    baseUrl: "https://api.githubcopilot.com",
    signupUrl: "https://github.com/settings/copilot",
    aliases: ["github-copilot"],
  },

  // ── AWS Bedrock ──────────────────────────────────────────────
  bedrock: {
    name: "bedrock",
    displayName: "AWS Bedrock",
    description: "AWS Bedrock — SDK credential chain",
    authType: "aws_sdk",
    apiMode: "bedrock_converse",
    aliases: ["bedrock"],
  },

  // ── Local / Self-hosted ──────────────────────────────────────
  ollama: {
    name: "ollama",
    displayName: "Ollama",
    description: "Local Ollama instance",
    authType: "none",
    apiMode: "chat_completions",
    baseUrl: "http://localhost:11434/v1",
    aliases: ["ollama"],
  },
  lmstudio: {
    name: "lmstudio",
    displayName: "LM Studio",
    description: "Local LM Studio instance",
    authType: "none",
    apiMode: "chat_completions",
    baseUrl: "http://localhost:1234/v1",
    aliases: ["lm-studio", "lmstudio"],
  },
};

// ─── Provider Lookup ──────────────────────────────────────────────

/**
 * Get a provider profile by name.
 * Returns null if not found.
 */
export function getProvider(name: string): ProviderProfile | null {
  return PROVIDER_REGISTRY[name] ?? null;
}

/**
 * List all providers, optionally filtered by auth type.
 */
export function listProviders(filter?: {
  authType?: string;
}): ProviderProfile[] {
  const all = Object.values(PROVIDER_REGISTRY);
  if (!filter?.authType) return all;
  return all.filter((p) => p.authType === filter.authType);
}

/**
 * List all OAuth providers (auth types starting with "oauth").
 */
export function listOAuthProviders(): ProviderProfile[] {
  return Object.values(PROVIDER_REGISTRY).filter((p) =>
    p.authType.startsWith("oauth"),
  );
}
```

---

# ── src/providers/aliases.ts ───────────────────────────────────

```typescript
/**
 * Provider Alias Map — common names → canonical provider IDs.
 * Ported from Hermes Python (hermes_cli/providers.py ALIASES dict).
 * Users can type "grok" instead of "xai", "claude" instead of "anthropic".
 */

export const ALIASES: Record<string, string> = {
  // Anthropic
  claude: "anthropic",

  // xAI / Grok
  grok: "xai",
  "xai-oauth": "xai",

  // Google
  gemini: "gemini",
  "google-gemini": "gemini",
  "google-gemini-cli": "gemini",
  "gemini-cli": "gemini",

  // DeepSeek
  "deep-seek": "deepseek",
  ds: "deepseek",

  // MiniMax
  minimax: "minimax-oauth",
  "minimax-cn": "minimax-oauth",

  // OpenAI
  "openai-api": "openai-api",
  codex: "openai-codex",
  "openai-codex": "openai-codex",

  // Zhipu / GLM
  zhipu: "zai",
  glm: "zai",

  // Kimi / Moonshot
  kimi: "kimi-coding",
  moonshot: "kimi-coding",

  // Alibaba / Qwen
  alibaba: "alibaba",
  qwen: "alibaba",
  dashscope: "alibaba",
  "qwen-oauth": "qwen-oauth",

  // Nous
  nous: "nous",

  // NVIDIA
  nvidia: "nvidia",

  // HuggingFace
  huggingface: "huggingface",
  hf: "huggingface",

  // OpenRouter
  "open-router": "openrouter",

  // OpenCode
  "opencode-zen": "opencode-zen",
  "opencode-go": "opencode-go",

  // KiloCode
  kilocode: "kilocode",

  // AI Gateway
  "ai-gateway": "ai-gateway",
  vercel: "ai-gateway",

  // Azure
  azure: "azure-foundry",
  "azure-foundry": "azure-foundry",

  // Local
  ollama: "ollama",
  lmstudio: "lmstudio",

  // Copilot
  copilot: "copilot",
  "github-copilot": "copilot",
};

/**
 * Resolve a provider name through aliases.
 * Returns canonical name, or the original if unrecognized.
 */
export function resolveAlias(name: string): string {
  return ALIASES[name.toLowerCase().trim()] ?? name;
}

/**
 * Check if a name is a registered alias.
 */
export function isAlias(name: string): boolean {
  return name.toLowerCase().trim() in ALIASES;
}
```

---

# ── src/providers/overlays.ts ──────────────────────────────────

```typescript
/**
 * Provider Overlays — metadata layered on top of core profiles.
 * Ported from Hermes Python HERMES_OVERLAYS dict.
 *
 * Adds transport mode, aggregator flag, env hints, and base URL
 * overrides without modifying core provider definitions.
 */

export interface ProviderOverlay {
  transport?: string;
  isAggregator?: boolean;
  extraEnvVars?: string[];
  baseUrlOverride?: string;
  baseUrlEnvVar?: string;
}

export const PROVIDER_OVERLAYS: Record<string, ProviderOverlay> = {
  openrouter: { transport: "openai_chat", isAggregator: true },
  "ai-gateway": { transport: "openai_chat", isAggregator: true },
  anthropic: { transport: "anthropic_messages" },
  "openai-api": { transport: "chat_completions" },
  "openai-codex": { transport: "codex_responses" },
  "xai-oauth": { transport: "codex_responses" },
  "minimax-oauth": { transport: "anthropic_messages" },
  nous: { transport: "chat_completions" },
  bedrock: { transport: "bedrock_converse" },
  copilot: { transport: "codex_responses" },
};

export function getOverlay(providerId: string): ProviderOverlay | null {
  return PROVIDER_OVERLAYS[providerId] ?? null;
}

export function getTransport(providerId: string): string | undefined {
  return PROVIDER_OVERLAYS[providerId]?.transport;
}

export function isAggregator(providerId: string): boolean {
  return PROVIDER_OVERLAYS[providerId]?.isAggregator ?? false;
}
```

---

# ── src/auth/jwt-utils.ts ──────────────────────────────────────

```typescript
/**
 * JWT Utilities — decode & inspect OAuth access tokens.
 * We never verify signatures (that's the provider's job).
 * We only extract expiry claims for proactive refresh decisions.
 */

const SKEW_SECONDS_DEFAULT = 120; // 2 min skew

/**
 * Decode the payload of a JWT without verifying signature.
 */
export function decodeJwtClaims(
  token: string,
): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1]!;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Check if a token is expiring (within skew window from now).
 * Handles JWT `exp`, absolute ms, and ISO string timestamps.
 */
export function isTokenExpiring(
  token: string | undefined | null,
  expiresAtIso: string | undefined | null,
  expiresAtMs: number | undefined | null,
  skewSeconds: number = SKEW_SECONDS_DEFAULT,
): boolean {
  if (!token || token.length < 4) return true;

  // Try JWT claims first
  const claims = decodeJwtClaims(token);
  if (claims?.exp) {
    const exp = Number(claims.exp);
    if (!isNaN(exp)) {
      return exp <= Math.floor(Date.now() / 1000) + skewSeconds;
    }
  }

  // Try absolute ms timestamp
  if (expiresAtMs) {
    return expiresAtMs <= Date.now() + skewSeconds * 1000;
  }

  // Try ISO string
  if (expiresAtIso) {
    const epoch = new Date(expiresAtIso).getTime();
    if (!isNaN(epoch)) {
      return epoch <= Date.now() + skewSeconds * 1000;
    }
  }

  return false;
}

/**
 * Extract the `exp` claim from a JWT.
 */
export function getTokenExpiry(token: string): number | null {
  const claims = decodeJwtClaims(token);
  if (!claims?.exp) return null;
  const exp = Number(claims.exp);
  return isNaN(exp) ? null : exp;
}
```

---

# ── src/auth/user-store.ts ─────────────────────────────────────

```typescript
/**
 * User Store — user registration + API key hashing and verification.
 *
 * API keys are generated server-side, stored hashed (SHA-256).
 * The raw key is returned once on creation; never stored in plaintext.
 * Only the prefix (first 8 chars) is stored for user identification.
 */

import { eq, and } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { db } from "../db";
import { user, apiKeys } from "../db/schema";

// ─── Types ────────────────────────────────────────────────────────

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKeyRecord {
  id: string;
  userId: string;
  keyHash: string;
  keyPrefix: string;
  label: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

export interface CreatedApiKey {
  record: ApiKeyRecord;
  rawKey: string; // Shown once to user
}

// ─── Hashing ──────────────────────────────────────────────────────

const API_KEY_PREFIX = "sk-";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const entropy = randomBytes(32).toString("hex");
  const raw = `${API_KEY_PREFIX}${entropy}`;
  const hash = hashKey(raw);
  const prefix = raw.slice(0, 11); // "sk-" + 8 chars
  return { raw, hash, prefix };
}

// ─── User CRUD ────────────────────────────────────────────────────

export async function createUser(
  email: string,
  name?: string | null,
): Promise<UserRecord> {
  const [row] = await db
    .insert(user)
    .values({ email, name: name ?? null })
    .returning();
  if (!row) throw new Error("Failed to create user");
  return row as UserRecord;
}

export async function getUserById(userId: string): Promise<UserRecord | null> {
  const [row] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  return (row as UserRecord | undefined) ?? null;
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const [row] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  return (row as UserRecord | undefined) ?? null;
}

export async function listUsers(): Promise<UserRecord[]> {
  return (await db.select().from(user).orderBy(user.createdAt)) as UserRecord[];
}

// ─── API Key CRUD ─────────────────────────────────────────────────

export async function createApiKey(
  userId: string,
  label?: string,
  scopes?: string[],
): Promise<CreatedApiKey> {
  const { raw, hash, prefix } = generateApiKey();

  const [row] = await db
    .insert(apiKeys)
    .values({
      userId,
      keyHash: hash,
      keyPrefix: prefix,
      label: label ?? "default",
      scopes: scopes ?? ["*"],
    })
    .returning();

  if (!row) throw new Error("Failed to create API key");

  return {
    record: row as ApiKeyRecord,
    rawKey: raw,
  };
}

export async function resolveUserFromApiKey(
  bearerToken: string,
): Promise<{ user: UserRecord; apiKey: ApiKeyRecord } | null> {
  const token = bearerToken.startsWith("Bearer ")
    ? bearerToken.slice(7)
    : bearerToken;
  const hash = hashKey(token);

  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.isActive, true)))
    .limit(1);

  if (!row) return null;
  const keyRecord = row as ApiKeyRecord;

  // Check expiry
  if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
    return null;
  }

  // Update lastUsedAt
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, keyRecord.id));

  // Fetch user
  const userRecord = await getUserById(keyRecord.userId);
  if (!userRecord) return null;

  return { user: userRecord, apiKey: keyRecord };
}

export async function listApiKeys(userId: string): Promise<ApiKeyRecord[]> {
  return (await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(apiKeys.createdAt)) as ApiKeyRecord[];
}

export async function revokeApiKey(
  keyId: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .update(apiKeys)
    .set({ isActive: false })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)));
  return (result as unknown as { rowCount: number }).rowCount > 0;
}
```

---

# ── src/auth/login-session.ts ──────────────────────────────────

```typescript
/**
 * Login Session Store — in-memory multi-phase OAuth login sessions.
 *
 * For web frontends that need to display user_code and verification_uri
 * to the user during the OAuth flow, instead of blocking until completion.
 *
 * Phase 1: POST /login/start → { sessionId, userCode, verificationUri }
 * Phase 2: Frontend polls GET /login/status/:id → "pending" → "success"
 * Background: Polls OAuth token endpoint, saves credentials on completion
 */

import type { OAuthAuthState } from "../types/providers";
import { MiniMaxOAuthProvider } from "../oauth/user-code";
import { DeviceCodeOAuthProvider } from "../oauth/device-code";

// ─── Types ────────────────────────────────────────────────────────

export type LoginSessionStatus =
  | "pending"
  | "polling"
  | "success"
  | "error";

interface StoredSession {
  provider: string;
  region: string;
  userId: string;
  status: LoginSessionStatus;
  flowType: string;
  userCode: string;
  verificationUri: string;
  verificationUrl: string;
  intervalMs: number;
  secret: string;
  portalBaseUrl: string;
  expiredIn: number;
  authState?: OAuthAuthState;
  error?: string;
  createdAt: number;
  expiresAt: number;
}

const SESSION_TTL_MS = 15 * 60 * 1000; // 15 min
const CLEANUP_INTERVAL_MS = 60_000; // clean every 60s

const sessions = new Map<string, StoredSession>();
let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

// ─── Provider Handler Interface ───────────────────────────────────

interface ProviderHandler {
  flowType: string;
  start(portalBaseUrl: string, region: string): Promise<{
    userCode: string;
    verificationUri: string;
    verificationUrl: string;
    intervalMs: number;
    expiredIn: number;
    secret: string;
  }>;
  poll(
    portalBaseUrl: string,
    secret: string,
    userCode: string,
    expiredIn: number,
    intervalMs: number,
  ): Promise<OAuthAuthState>;
}

// ─── MiniMax Handler (user_code) ──────────────────────────────────

const minimaxHandler: ProviderHandler = {
  flowType: "user_code",
  async start(portalBaseUrl: string, _region: string) {
    const oauth = new MiniMaxOAuthProvider();
    const { codeVerifier, codeChallenge, state } = await oauth.generatePKCE();
    const cd = await oauth.requestUserCode(portalBaseUrl, codeChallenge, state);
    return {
      userCode: cd.userCode,
      verificationUri: cd.verificationUri,
      verificationUrl: cd.verificationUrl,
      intervalMs: cd.intervalMs,
      expiredIn: cd.expiredIn,
      secret: codeVerifier,
    };
  },
  async poll(portalBaseUrl, codeVerifier, userCode, expiredIn, intervalMs) {
    const oauth = new MiniMaxOAuthProvider();
    const tokenData = await oauth.pollToken(
      portalBaseUrl,
      oauth.clientId,
      userCode,
      codeVerifier,
      expiredIn,
      intervalMs,
    );
    const region = portalBaseUrl.includes("minimaxi.com") ? "cn" : "global";
    const infBase = oauth.getInferenceBase(region);
    return oauth.buildAuthState(tokenData, region, portalBaseUrl, infBase);
  },
};

// ─── Nous Handler (device_code) ───────────────────────────────────

const nousHandler: ProviderHandler = {
  flowType: "device_code",
  async start(portalBaseUrl: string, _region: string) {
    const oauth = new DeviceCodeOAuthProvider();
    const cd = await oauth.requestDeviceCode(portalBaseUrl);
    return {
      userCode: cd.userCode,
      verificationUri: cd.verificationUri,
      verificationUrl: cd.verificationUrl,
      intervalMs: cd.interval * 1000,
      expiredIn: cd.expiresIn,
      secret: cd.deviceCode,
    };
  },
  async poll(portalBaseUrl, deviceCode, _userCode, expiredIn, intervalMs) {
    const oauth = new DeviceCodeOAuthProvider();
    const tokenData = await oauth.pollToken(
      portalBaseUrl,
      deviceCode,
      expiredIn,
      intervalMs,
    );
    return oauth.buildAuthState(tokenData);
  },
};

// ─── Provider Dispatch ────────────────────────────────────────────

function getHandler(providerName: string): ProviderHandler {
  switch (providerName) {
    case "minimax-oauth":
      return minimaxHandler;
    case "nous":
      return nousHandler;
    default:
      throw new Error(
        `Provider "${providerName}" does not support two-phase web login. ` +
          "This provider uses authorization_code with a local callback server, " +
          "or an external process that can't run in a browser context. " +
          "Use the CLI tool instead.",
      );
  }
}

// ─── Session Management ───────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
}

function ensureCleanup(): void {
  if (_cleanupTimer) return;
  _cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
      if (s.expiresAt <= now) sessions.delete(id);
    }
  }, CLEANUP_INTERVAL_MS);
}

// ─── Public API ───────────────────────────────────────────────────

export async function startLogin(
  provider: string,
  region: string,
  userId: string,
): Promise<{
  sessionId: string;
  userCode: string;
  verificationUri: string;
  verificationUrl: string;
  intervalMs: number;
}> {
  ensureCleanup();

  const handler = getHandler(provider);
  const portalBaseUrl =
    provider === "minimax-oauth"
      ? new MiniMaxOAuthProvider().getPortalBase(region)
      : "https://portal.nousresearch.com";

  const startData = await handler.start(portalBaseUrl, region);
  const id = generateId();
  const now = Date.now();

  const stored: StoredSession = {
    provider,
    region,
    userId,
    status: "pending",
    flowType: handler.flowType,
    userCode: startData.userCode,
    verificationUri: startData.verificationUri,
    verificationUrl: startData.verificationUrl,
    intervalMs: startData.intervalMs,
    secret: startData.secret,
    portalBaseUrl,
    expiredIn: startData.expiredIn,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };

  sessions.set(id, stored);
  pollInBackground(id, stored);

  return {
    sessionId: id,
    userCode: startData.userCode,
    verificationUri: startData.verificationUri,
    verificationUrl: startData.verificationUrl,
    intervalMs: startData.intervalMs,
  };
}

export function getLoginStatus(
  sessionId: string,
): {
  status: LoginSessionStatus;
  authState?: OAuthAuthState;
  error?: string;
} | null {
  const s = sessions.get(sessionId);
  if (!s) return null;
  return {
    status: s.status,
    authState: s.status === "success" ? s.authState : undefined,
    error: s.status === "error" ? s.error : undefined,
  };
}

// ─── Background Polling ───────────────────────────────────────────

async function pollInBackground(id: string, session: StoredSession) {
  try {
    const s = sessions.get(id);
    if (!s) return;
    s.status = "polling";

    const handler = getHandler(session.provider);
    const authState = await handler.poll(
      session.portalBaseUrl,
      session.secret,
      session.userCode,
      session.expiredIn,
      session.intervalMs,
    );

    // Save credentials — import dynamically to avoid circular deps
    const { saveCredentials } = await import("../oauth/store");
    await saveCredentials(authState, session.userId);

    const updated = sessions.get(id);
    if (updated) {
      updated.status = "success";
      updated.authState = authState;
    }
  } catch (err) {
    const updated = sessions.get(id);
    if (updated) {
      updated.status = "error";
      updated.error = err instanceof Error ? err.message : "Unknown error";
    }
  }
}
```

---

# ── src/auth/credential-sources.ts ─────────────────────────────

```typescript
/**
 * Credential Sources — track where each credential comes from,
 * with source suppression so removed entries stay gone on reload.
 *
 * Sources: "oauth", "env:OPENROUTER_API_KEY", "manual", "config:myname"
 */

import type { PoolEntry } from "./credential-pool";

// ─── Types ────────────────────────────────────────────────────────

export interface SuppressedSource {
  provider: string;
  source: string;
}

// ─── Suppression ──────────────────────────────────────────────────

let _suppressed: Record<string, string[]> = {};

export function loadSuppressedSources(): Record<string, string[]> {
  return _suppressed;
}

export function setSuppressedSources(sources: Record<string, string[]>): void {
  _suppressed = sources;
}

// ─── Filtering ────────────────────────────────────────────────────

export function filterSuppressedSources(
  entries: PoolEntry[],
  suppressed: Record<string, string[]>,
): PoolEntry[] {
  if (Object.keys(suppressed).length === 0) return entries;
  return entries.filter((e) => {
    if (!e.source) return true;
    const providerSuppressed = suppressed[e.provider];
    if (!providerSuppressed) return true;
    return !providerSuppressed.some(
      (s) =>
        s === e.source ||
        (s.endsWith(":*") && e.source!.startsWith(s.slice(0, -1))),
    );
  });
}

export function suppressSource(
  provider: string,
  source: string,
): Record<string, string[]> {
  const updated = { ..._suppressed };
  if (!updated[provider]) updated[provider] = [];
  if (!updated[provider]!.includes(source)) {
    updated[provider]!.push(source);
  }
  _suppressed = updated;
  return updated;
}

export function unsuppressSource(
  provider: string,
  source: string,
): Record<string, string[]> {
  const updated = { ..._suppressed };
  if (updated[provider]) {
    updated[provider] = updated[provider]!.filter((s) => s !== source);
    if (updated[provider]!.length === 0) delete updated[provider];
  }
  _suppressed = updated;
  return updated;
}

// ─── Env Seeding ──────────────────────────────────────────────────

export function seedFromEnv(): PoolEntry[] {
  const entries: PoolEntry[] = [];
  const envPatterns: Record<string, string> = {
    OPENROUTER_API_KEY: "openrouter",
    ANTHROPIC_API_KEY: "anthropic",
    OPENAI_API_KEY: "openai-api",
    DEEPSEEK_API_KEY: "deepseek",
    XAI_API_KEY: "xai",
    GOOGLE_API_KEY: "gemini",
    GEMINI_API_KEY: "gemini",
    HF_TOKEN: "huggingface",
    NVIDIA_API_KEY: "nvidia",
    MINIMAX_API_KEY: "minimax-oauth",
  };

  for (const [envVar, provider] of Object.entries(envPatterns)) {
    const value = typeof process !== "undefined" ? process.env[envVar] : undefined;
    if (value && value.length > 0) {
      entries.push({
        provider,
        credentialKey: `env:${envVar}`,
        accessToken: value,
        exhaustedAt: null,
        exhaustedReason: null,
        exhaustedUntil: null,
        isTerminal: false,
        useCount: 0,
        source: `env:${envVar}`,
        rawToken: value,
      });
    }
  }
  return entries;
}
```

---

# ── src/auth/credential-sanitization.ts ────────────────────────

```typescript
/**
 * Credential Sanitization — fingerprint borrowed secrets instead of
 * persisting them in plaintext.
 *
 * Ported from Hermes Python (agent/credential_persistence.py).
 * Only "oauth" and "manual" sources get verbatim persistence.
 * "env:*" and "config:*" sources get SHA-256 fingerprints stored.
 */

import { createHash } from "node:crypto";

const OWNED_SOURCE_PREFIXES = ["oauth", "manual"];

function isOwnedSource(source?: string): boolean {
  if (!source) return false;
  return OWNED_SOURCE_PREFIXES.some((p) => source.startsWith(p));
}

export function sanitizeForPersistence(payload: {
  accessToken?: string;
  refreshToken?: string;
  source?: string;
}): { accessToken: string; refreshToken?: string; accessTokenHash?: string } {
  if (!payload.accessToken) return { accessToken: "" };
  if (isOwnedSource(payload.source)) {
    return {
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
    };
  }
  return {
    accessToken: "",
    refreshToken: undefined,
    accessTokenHash: fingerprint(payload.accessToken),
  };
}

export function fingerprint(secret: string): string {
  return `sha256:${createHash("sha256").update(secret).digest("hex")}`;
}

export function verifyAgainstEnv(
  envVar: string,
  storedHash: string,
): boolean {
  if (!storedHash.startsWith("sha256:")) return false;
  const current = typeof process !== "undefined" ? process.env[envVar] : undefined;
  if (!current) return false;
  return fingerprint(current) === storedHash;
}

export function resolveBorrowedCredential(
  source: string,
  _storedHash: string,
): string | null {
  if (!source.startsWith("env:")) return null;
  const envVar = source.slice(4);
  return typeof process !== "undefined" ? process.env[envVar] ?? null : null;
}
```

---

# ── src/auth/credential-pool.ts ────────────────────────────────

```typescript
/**
 * Credential Pool — per-provider credential management with strategies,
 * exhaustion cooldowns, multi-key rotation, proactive refresh, and
 * terminal error quarantine.
 *
 * Strategies: fill_first, round_robin, least_used, random
 */

import { isTokenExpiring } from "./jwt-utils";

// ─── Types ────────────────────────────────────────────────────────

export type PoolStrategy =
  | "fill_first"
  | "round_robin"
  | "least_used"
  | "random";

export interface PoolEntry {
  provider: string;
  credentialKey: string;
  accessToken: string;
  refreshToken?: string;
  exhaustedAt: number | null;
  exhaustedReason: string | null;
  exhaustedUntil: number | null;
  isTerminal: boolean;
  useCount: number;
  expiresAt?: string;
  expiresAtMs?: number;
  source?: string;
  rawToken?: string;
}

interface ExhaustionConfig {
  ttl: Record<string, number>;
  defaultTtl: number;
}

// ─── Constants ────────────────────────────────────────────────────

const DEFAULT_EXHAUSTION: ExhaustionConfig = {
  ttl: {
    "401": 5 * 60 * 1000,
    "402": 60 * 60 * 1000,
    "403": 30 * 60 * 1000,
    "429": 60 * 60 * 1000,
    "500": 2 * 60 * 1000,
    "502": 2 * 60 * 1000,
    "503": 5 * 60 * 1000,
    invalid_grant: -1,
    token_revoked: -1,
    invalid_token: -1,
    refresh_token_reused: -1,
  },
  defaultTtl: 10 * 60 * 1000,
};

const PROACTIVE_REFRESH_SKEW_MS = 120_000;
const TERMINAL_ERROR_PATTERNS: Record<string, readonly string[]> = {
  nous: ["invalid_grant", "invalid_token", "refresh_token_reused"] as const,
  "openai-codex": ["codex_refresh_failed", "invalid_grant", "token_expired"] as const,
  "xai-oauth": ["xai_refresh_failed", "invalid_grant"] as const,
  anthropic: ["invalid_grant", "refresh_token_reused"] as const,
  "minimax-oauth": ["invalid_grant", "token_revoked"] as const,
};

// ─── Pool State ───────────────────────────────────────────────────

type PoolKey = string;
const _pool = new Map<PoolKey, PoolEntry[]>();
const _roundRobinCounters = new Map<PoolKey, number>();

function getPoolKey(userId: string, providerName: string): PoolKey {
  return `${userId}:${providerName}`;
}

function getTtl(reason: string | null): number {
  if (!reason) return DEFAULT_EXHAUSTION.defaultTtl;
  return DEFAULT_EXHAUSTION.ttl[reason] ?? DEFAULT_EXHAUSTION.defaultTtl;
}

function isTerminalForProvider(provider: string, reason: string | null): boolean {
  if (!reason) return false;
  const patterns = TERMINAL_ERROR_PATTERNS[provider] ?? [
    "invalid_grant",
    "token_revoked",
    "invalid_token",
  ];
  return patterns.some((p) => reason.toLowerCase().includes(p.toLowerCase()));
}

// ─── Core Operations ──────────────────────────────────────────────

export async function loadCredentials(
  userId: string,
  entries: PoolEntry[],
): Promise<void> {
  const poolKey = getPoolKey(userId, entries[0]?.provider ?? "unknown");
  if (entries.length === 0) {
    _pool.delete(poolKey);
  } else {
    _pool.set(poolKey, entries);
  }
  if (!_roundRobinCounters.has(poolKey)) {
    _roundRobinCounters.set(poolKey, 0);
  }
}

export async function acquireCredential(
  userId: string,
  providerName: string,
  strategy: PoolStrategy = "fill_first",
): Promise<PoolEntry | null> {
  const poolKey = getPoolKey(userId, providerName);
  const entries = _pool.get(poolKey);
  if (!entries || entries.length === 0) return null;

  const available = getAvailableEntries(entries);
  if (available.length === 0) return null;

  const selected = pickByStrategy(available, strategy, poolKey);
  selected.useCount++;

  if (
    selected.refreshToken &&
    isTokenExpiring(selected.rawToken, selected.expiresAt, selected.expiresAtMs)
  ) {
    refreshEntryInBackground(userId, providerName, selected).catch(() => {});
  }

  return selected;
}

function getAvailableEntries(entries: PoolEntry[]): PoolEntry[] {
  const now = Date.now();
  return entries.filter((e) => {
    if (e.exhaustedAt === null) return true;
    if (e.isTerminal) return false;
    if (e.exhaustedUntil !== null && e.exhaustedUntil <= now) {
      e.exhaustedAt = null;
      e.exhaustedReason = null;
      e.exhaustedUntil = null;
      return true;
    }
    return false;
  });
}

function pickByStrategy(
  available: PoolEntry[],
  strategy: PoolStrategy,
  poolKey: PoolKey,
): PoolEntry {
  if (available.length === 1) return available[0]!;
  switch (strategy) {
    case "round_robin": {
      const counter = _roundRobinCounters.get(poolKey) ?? 0;
      const idx = counter % available.length;
      _roundRobinCounters.set(poolKey, counter + 1);
      return available[idx]!;
    }
    case "least_used":
      return available.reduce((a, b) => (a.useCount <= b.useCount ? a : b));
    case "random":
      return available[Math.floor(Math.random() * available.length)]!;
    case "fill_first":
    default:
      return available[0]!;
  }
}

export function reportExhausted(
  userId: string,
  providerName: string,
  credentialKey: string,
  reason: string,
  retryAfter?: string | null,
): void {
  const poolKey = getPoolKey(userId, providerName);
  const entries = _pool.get(poolKey);
  if (!entries) return;
  const entry = entries.find((e) => e.credentialKey === credentialKey);
  if (!entry) return;

  const now = Date.now();

  if (isTerminalForProvider(providerName, reason)) {
    entry.exhaustedAt = now;
    entry.exhaustedReason = reason;
    entry.exhaustedUntil = null;
    entry.isTerminal = true;
    return;
  }

  let ttl = getTtl(reason);
  if (retryAfter) {
    const parsed = parseRetryAfter(retryAfter);
    if (parsed !== null) ttl = Math.max(ttl, parsed);
  }

  entry.exhaustedAt = now;
  entry.exhaustedReason = reason;
  entry.exhaustedUntil = now + ttl;
}

export function hasAvailableCredentials(
  userId: string,
  providerName: string,
): boolean {
  const poolKey = getPoolKey(userId, providerName);
  const entries = _pool.get(poolKey);
  if (!entries || entries.length === 0) return false;
  return getAvailableEntries(entries).length > 0;
}

export function clearPool(userId: string, providerName: string): void {
  const poolKey = getPoolKey(userId, providerName);
  _pool.delete(poolKey);
  _roundRobinCounters.delete(poolKey);
}

export function clearAllPools(): void {
  _pool.clear();
  _roundRobinCounters.clear();
}

// ─── Helpers ──────────────────────────────────────────────────────

function parseRetryAfter(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  const seconds = Number(trimmed);
  if (!isNaN(seconds) && seconds > 0) return seconds * 1000;
  const parsed = new Date(trimmed).getTime();
  if (!isNaN(parsed)) {
    const delay = parsed - Date.now();
    return delay > 0 ? delay : 60_000;
  }
  return null;
}

async function refreshEntryInBackground(
  userId: string,
  providerName: string,
  entry: PoolEntry,
): Promise<void> {
  try {
    const { refreshCredentials } = await import("./quarantine");
    const fresh = await refreshCredentials(providerName, userId);
    if (fresh && fresh.accessToken) {
      entry.accessToken = fresh.accessToken;
      entry.refreshToken = fresh.refreshToken;
      entry.expiresAt = fresh.expiresAt;
      entry.expiresAtMs = fresh.expiresAt
        ? new Date(fresh.expiresAt).getTime()
        : undefined;
      entry.rawToken = fresh.accessToken;
      entry.exhaustedAt = null;
      entry.exhaustedReason = null;
      entry.exhaustedUntil = null;
      entry.isTerminal = false;
    }
  } catch {
    // Non-terminal failure — don't mark exhausted
  }
}

export function getPoolStats(
  userId: string,
  providerName: string,
): {
  total: number;
  available: number;
  exhausted: number;
  terminal: number;
} | null {
  const poolKey = getPoolKey(userId, providerName);
  const entries = _pool.get(poolKey);
  if (!entries) return null;
  const now = Date.now();
  let available = 0;
  let exhaustedAngry = 0;
  let terminal = 0;
  for (const e of entries) {
    if (e.isTerminal) terminal++;
    else if (e.exhaustedAt !== null && e.exhaustedUntil !== null && e.exhaustedUntil > now)
      exhaustedAngry++;
    else available++;
  }
  return { total: entries.length, available, exhausted: exhaustedAngry, terminal };
}
```

---

# ── src/auth/quarantine.ts ─────────────────────────────────────

```typescript
/**
 * Quarantine — Dead Token Detection and Cleanup.
 *
 * When an OAuth token refresh fails with a terminal error
 * (invalid_grant, token revoked), credentials are quarantined
 * so the next API call fails fast with "re-login required".
 *
 * Provider-specific terminal error codes:
 *   nous: invalid_grant, invalid_token, refresh_token_reused
 *   openai-codex: codex_refresh_failed, invalid_grant, token_expired
 *   xai-oauth: xai_refresh_failed, invalid_grant
 *   anthropic: invalid_grant, refresh_token_reused
 *   minimax-oauth: invalid_grant, token_revoked
 */

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { oauthToken } from "../db/schema";
import type { OAuthAuthState } from "../types/providers";

const TERMINAL_PATTERNS: Record<string, readonly string[]> = {
  nous: ["invalid_grant", "invalid_token", "refresh_token_reused"] as const,
  "openai-codex": ["codex_refresh_failed", "invalid_grant", "token_expired"] as const,
  "xai-oauth": ["xai_refresh_failed", "invalid_grant"] as const,
  anthropic: ["invalid_grant", "refresh_token_reused"] as const,
  "minimax-oauth": ["invalid_grant", "token_revoked"] as const,
};

const QUARANTINE_CODES: Record<string, string> = {
  nous: "nous_refresh_failed",
  "openai-codex": "codex_refresh_failed",
  "xai-oauth": "xai_refresh_failed",
  anthropic: "anthropic_refresh_failed",
  "minimax-oauth": "minimax_refresh_failed",
};

export function isTerminalForProvider(
  provider: string,
  message: string,
): boolean {
  const patterns = TERMINAL_PATTERNS[provider] ?? [
    "invalid_grant",
    "token_revoked",
    "invalid_token",
  ];
  return patterns.some((p) => message.toLowerCase().includes(p));
}

export function isTerminalAuthError(
  error: unknown,
  provider?: string,
): boolean {
  if (error instanceof Error) {
    const msg = error.message;
    if (provider && isTerminalForProvider(provider, msg)) return true;
    const genericPatterns = [
      "invalid_grant",
      "token revoked",
      "token_expired",
      "invalid_token",
      "access_denied",
      "unauthorized_client",
      "invalid_client",
    ];
    return genericPatterns.some((p) => msg.toLowerCase().includes(p));
  }
  return false;
}

/**
 * Wipe credentials and mark with error info for quarantined provider+user.
 */
export async function quarantineCredentials(
  providerId: string,
  userId: string,
  error: Error,
): Promise<void> {
  const code = QUARANTINE_CODES[providerId] ?? "refresh_failed";
  const errorInfo = {
    code,
    message: error.message,
    reason: "runtime_refresh_failure",
    reloginRequired: true,
    at: new Date().toISOString(),
  };

  await db
    .update(oauthToken)
    .set({
      accessToken: "",
      refreshToken: "",
      lastError: errorInfo as any,
    })
    .where(
      and(
        eq(oauthToken.providerId, providerId),
        eq(oauthToken.userId, userId),
      ),
    );
}

/**
 * Refresh credentials via DB store. Re-exports for the pool.
 */
export async function refreshCredentials(
  providerName: string,
  userId: string,
): Promise<OAuthAuthState | null> {
  const { getCredentials, saveCredentials } = await import("../oauth/store");
  const creds = await getCredentials(providerName, userId);
  if (!creds?.refreshToken) return null;
  // Provider-specific refresh logic would go here
  // For now, returns existing credentials
  return creds;
}
```

---

# ── src/auth/provider-resolver.ts ─────────────────────────────

```typescript
/**
 * Provider Resolver — auto-detect provider from config or env vars.
 *
 * Priority chain:
 * 1. Explicit provider name
 * 2. HERMES_INFERENCE_PROVIDER env var
 * 3. Auto-detect from available API key env vars
 * 4. null (caller handles error)
 */

import { resolveAlias } from "../providers/aliases";
import { getOverlay } from "../providers/overlays";
import { PROVIDER_REGISTRY } from "../providers/registry";

export interface ResolvedProvider {
  id: string;
  source: "explicit" | "env" | "auto";
  transport?: string;
  isAggregator?: boolean;
}

const AUTO_DETECT_ORDER = [
  { id: "openrouter", envVars: ["OPENROUTER_API_KEY", "OPENAI_API_KEY"] },
  { id: "anthropic", envVars: ["ANTHROPIC_API_KEY"] },
  { id: "deepseek", envVars: ["DEEPSEEK_API_KEY"] },
  { id: "xai", envVars: ["XAI_API_KEY"] },
  { id: "gemini", envVars: ["GEMINI_API_KEY", "GOOGLE_API_KEY"] },
  { id: "openai-api", envVars: ["OPENAI_API_KEY"] },
  { id: "huggingface", envVars: ["HF_TOKEN"] },
  { id: "nvidia", envVars: ["NVIDIA_API_KEY"] },
  { id: "minimax-oauth", envVars: ["MINIMAX_API_KEY"] },
];

export function resolveRequestedProvider(
  explicitProvider?: string,
): ResolvedProvider | null {
  if (explicitProvider) {
    const resolved = resolveAlias(explicitProvider);
    const profile = PROVIDER_REGISTRY[resolved];
    if (!profile) return null;
    const overlay = getOverlay(resolved);
    return { id: resolved, source: "explicit", transport: overlay?.transport, isAggregator: overlay?.isAggregator };
  }

  const envProvider = typeof process !== "undefined" ? process.env["HERMES_INFERENCE_PROVIDER"] : undefined;
  if (envProvider) {
    const resolved = resolveAlias(envProvider);
    const overlay = getOverlay(resolved);
    return { id: resolved, source: "env", transport: overlay?.transport, isAggregator: overlay?.isAggregator };
  }

  return autoDetectProvider();
}

export function autoDetectProvider(): ResolvedProvider | null {
  for (const entry of AUTO_DETECT_ORDER) {
    const hasKey = entry.envVars.some(
      (v) => typeof process !== "undefined" && process.env[v]?.length,
    );
    if (hasKey) {
      const overlay = getOverlay(entry.id);
      return {
        id: entry.id,
        source: "auto",
        transport: overlay?.transport,
        isAggregator: overlay?.isAggregator,
      };
    }
  }
  return null;
}

export function listAvailableProviders(): ResolvedProvider[] {
  return AUTO_DETECT_ORDER.filter((e) =>
    e.envVars.some((v) => typeof process !== "undefined" && process.env[v]?.length),
  ).map((e) => {
    const overlay = getOverlay(e.id);
    return { id: e.id, source: "auto" as const, transport: overlay?.transport, isAggregator: overlay?.isAggregator };
  });
}
```

---

# ── src/oauth/store.ts ─────────────────────────────────────────

```typescript
/**
 * OAuth Token Store — persist OAuth tokens to PostgreSQL.
 * Uses the existing `oauth_tokens` table with user/provider scoping.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { oauthProvider, oauthToken, user } from "../db/schema";
import type { OAuthAuthState, OAuthProviderConfig } from "../types/providers";

// ─── Get provider config ──────────────────────────────────────────

export async function getProviderConfig(
  providerName: string,
  userId: string,
): Promise<OAuthProviderConfig | null> {
  const [row] = await db
    .select()
    .from(oauthProvider)
    .where(
      and(
        eq(oauthProvider.providerId, providerName),
        eq(oauthProvider.userId, userId),
        eq(oauthProvider.isActive, true),
      ),
    )
    .limit(1);
  return (row as OAuthProviderConfig | undefined) ?? null;
}

export async function ensureProviderConfig(
  state: OAuthAuthState,
  userId: string,
): Promise<string> {
  const existing = await getProviderConfig(state.provider, userId);
  if (existing) return existing.id;

  const [row] = await db
    .insert(oauthProvider)
    .values({
      userId,
      providerId: state.provider,
      region: state.region ?? "global",
      portalBaseUrl: state.portalBaseUrl,
      inferenceBaseUrl: state.inferenceBaseUrl,
      clientId: state.clientId,
      scope: state.scope,
      isActive: true,
    })
    .returning();
  return (row as any).id;
}

// ─── Credential CRUD ──────────────────────────────────────────────

function rowToAuthState(row: Record<string, unknown>): OAuthAuthState {
  return {
    provider: (row as any).providerId ?? "",
    portalBaseUrl: (row as any).portalBaseUrl ?? "",
    inferenceBaseUrl: (row as any).inferenceBaseUrl ?? "",
    clientId: (row as any).clientId ?? "",
    scope: (row as any).scope ?? "",
    tokenType: (row as any).tokenType ?? "Bearer",
    accessToken: (row as any).accessToken ?? "",
    refreshToken: (row as any).refreshToken ?? undefined,
    region: (row as any).region ?? undefined,
    obtainedAt: (row as any).obtainedAt?.toISOString?.() ?? new Date().toISOString(),
    expiresAt: (row as any).expiresAt?.toISOString?.(),
    expiresIn: (row as any).expiresIn ?? 0,
    lastAuthError: (row as any).lastAuthError ?? undefined,
  };
}

export async function getCredentials(
  providerName: string,
  userId: string,
): Promise<OAuthAuthState | null> {
  // Find the provider config to get the provider record ID
  const config = await getProviderConfig(providerName, userId);
  if (!config) return null;

  const [row] = await db
    .select()
    .from(oauthToken)
    .where(
      and(
        eq(oauthToken.providerId, config.id),
        eq(oauthToken.userId, userId),
      ),
    )
    .orderBy(desc(oauthToken.obtainedAt))
    .limit(1);

  if (!row) return null;
  return rowToAuthState(row as Record<string, unknown>);
}

export async function saveCredentials(
  state: OAuthAuthState,
  userId: string,
): Promise<void> {
  const providerConfigId = await ensureProviderConfig(state, userId);

  // Upsert: check for existing token for this provider+user
  const existing = await db
    .select()
    .from(oauthToken)
    .where(
      and(
        eq(oauthToken.providerId, providerConfigId),
        eq(oauthToken.userId, userId),
      ),
    )
    .limit(1);

  const values = {
    providerId: providerConfigId,
    userId,
    accessToken: state.accessToken,
    refreshToken: state.refreshToken ?? "",
    tokenType: state.tokenType,
    scope: state.scope,
    expiresAt: state.expiresAt
      ? new Date(state.expiresAt)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    obtainedAt: state.obtainedAt ? new Date(state.obtainedAt) : new Date(),
    lastError: state.lastAuthError ?? null,
  };

  if (existing && (existing as any).id) {
    await db
      .update(oauthToken)
      .set(values)
      .where(eq(oauthToken.id, (existing as any).id));
  } else {
    await db.insert(oauthToken).values(values);
  }
}

export async function clearCredentials(
  providerName: string,
  userId: string,
  errorInfo?: {
    code: string;
    message: string;
    reason: string;
    reloginRequired: boolean;
    at: string;
  },
): Promise<void> {
  const config = await getProviderConfig(providerName, userId);
  if (!config) return;

  const updateData: Record<string, unknown> = {
    accessToken: "",
    refreshToken: "",
  };
  if (errorInfo) {
    updateData.lastError = errorInfo;
  }

  await db
    .update(oauthToken)
    .set(updateData)
    .where(
      and(
        eq(oauthToken.providerId, config.id),
        eq(oauthToken.userId, userId),
      ),
    );
}
```

---

# ── src/oauth/user-code.ts ────────────────────────────────────

```typescript
/**
 * MiniMax OAuth — User Code Grant with PKCE.
 *
 * Flow:
 * 1. Generate PKCE challenge + verifier
 * 2. POST /oauth/authorize → get user_code + verification_uri
 * 3. User opens URI, enters code, approves
 * 4. POST /oauth/token → exchange code_verifier for tokens
 * 5. Tokens last ~1 year (31536000s)
 *
 * Supports two regions: global (default) and cn (api.minimaxi.com)
 */

const PORTAL_BASE_GLOBAL = "https://api.minimax.io";
const PORTAL_BASE_CN = "https://api.minimaxi.com";
const INFERENCE_BASE_GLOBAL = "https://api.minimax.io/anthropic";
const INFERENCE_BASE_CN = "https://api.minimaxi.com/anthropic";

/**
 * Generate PKCE code verifier and challenge.
 */
async function generatePKCE(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}> {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(64));
  const codeVerifier = btoa(String.fromCharCode(...verifierBytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const encoder = new TextEncoder();
  const hashBytes = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(codeVerifier),
  );
  const hashArray = Array.from(new Uint8Array(hashBytes));
  const codeChallenge = btoa(String.fromCharCode(...hashArray))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const stateBytes = crypto.getRandomValues(new Uint8Array(32));
  const state = btoa(String.fromCharCode(...stateBytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return { codeVerifier, codeChallenge, state };
}

/**
 * Request a user code from the MiniMax OAuth endpoint.
 */
async function requestUserCode(
  portalBaseUrl: string,
  codeChallenge: string,
  state: string,
): Promise<{
  userCode: string;
  verificationUri: string;
  verificationUrl: string;
  intervalMs: number;
  expiredIn: number;
}> {
  const url = `${portalBaseUrl}/oauth/authorize`;
  const body = JSON.stringify({
    response_type: "user_code",
    client_id: "78257093-7e40-4613-99e0-527b14b39113",
    scope: "group_id profile model.completion",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const data = await res.json();
  if (!res.ok)
    throw new Error(
      `MiniMax OAuth error: ${data?.base_resp?.status_msg ?? res.statusText}`,
    );

  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    verificationUrl: data.verification_uri,
    intervalMs: (data.interval ?? 3) * 1000,
    expiredIn: data.expired_in ?? 300,
  };
}

/**
 * Poll for the OAuth token after user approval.
 */
async function pollToken(
  portalBaseUrl: string,
  clientId: string,
  userCode: string,
  codeVerifier: string,
  expiredIn: number,
  intervalMs: number,
): Promise<Record<string, unknown>> {
  const url = `${portalBaseUrl}/oauth/token`;
  const deadline = Date.now() + expiredIn * 1000;
  let lastError: Error | null = null;

  while (Date.now() < deadline) {
    const body = JSON.stringify({
      grant_type: "user_code",
      client_id: clientId,
      user_code: userCode,
      code_verifier: codeVerifier,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const data = await res.json();

    if (res.ok && data.access_token) return data;

    const status = data?.base_resp?.status_code ?? res.status;
    if (status === "authorization_pending" || status === 20005) {
      lastError = null;
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }

    lastError = new Error(
      `MiniMax OAuth error: ${data?.base_resp?.status_msg ?? res.statusText}`,
    );
    break;
  }

  throw lastError ?? new Error("MiniMax OAuth: deadline exceeded");
}

/**
 * Build the OAuthAuthState from the token response.
 */
function buildAuthState(
  tokenData: Record<string, unknown>,
  region: string,
  portalBaseUrl: string,
  inferenceBaseUrl: string,
): import("../types/providers").OAuthAuthState {
  const expiresIn = Number(tokenData.expires_in ?? 31536000);
  return {
    provider: "minimax-oauth",
    region,
    portalBaseUrl,
    inferenceBaseUrl,
    clientId: "78257093-7e40-4613-99e0-527b14b39113",
    scope: "group_id profile model.completion",
    tokenType: "Bearer",
    accessToken: tokenData.access_token as string,
    refreshToken: tokenData.refresh_token as string | undefined,
    obtainedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    expiresIn,
  };
}

// ─── Public Class ──────────────────────────────────────────────────

export class MiniMaxOAuthProvider {
  clientId = "78257093-7e40-4613-99e0-527b14b39113";
  scope = "group_id profile model.completion";

  generatePKCE = generatePKCE;
  requestUserCode = requestUserCode;
  pollToken = pollToken;
  buildAuthState = buildAuthState;

  getPortalBase(region: string): string {
    return region === "cn" ? PORTAL_BASE_CN : PORTAL_BASE_GLOBAL;
  }

  getInferenceBase(region: string): string {
    return region === "cn" ? INFERENCE_BASE_CN : INFERENCE_BASE_GLOBAL;
  }
}
```

---

# ── src/oauth/device-code.ts ──────────────────────────────────

```typescript
/**
 * Device Code OAuth — RFC 8628 Device Authorization Grant.
 * Used by Nous Research portal.
 *
 * Flow:
 * 1. POST /oauth/device/code → get device_code + user_code + verification_uri
 * 2. User opens URI, enters code, approves
 * 3. POST /oauth/token → poll with device_code until approved
 */

/**
 * Request a device code from the OAuth endpoint.
 */
async function requestDeviceCode(
  portalBaseUrl: string,
): Promise<{
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUrl: string;
  interval: number;
  expiresIn: number;
}> {
  // Try known endpoints
  const endpoints = [
    `${portalBaseUrl}/oauth/device/code`,
    `${portalBaseUrl}/oauth2/device/code`,
  ];

  for (const url of endpoints) {
    const res = await fetch(url, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      return {
        deviceCode: data.device_code,
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        verificationUrl: data.verification_uri,
        interval: data.interval ?? 5,
        expiresIn: data.expires_in ?? 600,
      };
    }
  }

  throw new Error("Device code endpoint not found");
}

/**
 * Poll for the OAuth token after user approval.
 */
async function pollToken(
  portalBaseUrl: string,
  deviceCode: string,
  expiresIn: number,
  interval: number,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + expiresIn * 1000;
  let lastError: Error | null = null;

  while (Date.now() < deadline) {
    const res = await fetch(`${portalBaseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "device_code",
        device_code: deviceCode,
      }),
    });

    const data = await res.json();

    if (res.ok && data.access_token) return data;

    if (data.error === "authorization_pending" || data.error === "slow_down") {
      lastError = null;
      await new Promise((r) => setTimeout(r, interval * 1000));
      continue;
    }

    lastError = new Error(
      `Device code error: ${data.error_description ?? data.error ?? res.statusText}`,
    );
    break;
  }

  throw lastError ?? new Error("Device code OAuth: deadline exceeded");
}

/**
 * Build the OAuthAuthState from the token response.
 */
function buildAuthState(
  tokenData: Record<string, unknown>,
): import("../types/providers").OAuthAuthState {
  const expiresIn = Number(tokenData.expires_in ?? 3600);
  return {
    provider: "nous",
    region: "global",
    portalBaseUrl: "https://portal.nousresearch.com",
    inferenceBaseUrl: "https://inference-api.nousresearch.com/v1",
    clientId: (tokenData.client_id as string) ?? "",
    scope: (tokenData.scope as string) ?? "",
    tokenType: "Bearer",
    accessToken: tokenData.access_token as string,
    refreshToken: tokenData.refresh_token as string | undefined,
    obtainedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    expiresIn,
  };
}

export class DeviceCodeOAuthProvider {
  async requestDeviceCode(
    portalBaseUrl: string,
  ): ReturnType<typeof requestDeviceCode> {
    return requestDeviceCode(portalBaseUrl);
  }

  async pollToken(
    portalBaseUrl: string,
    deviceCode: string,
    expiresIn: number,
    interval: number,
  ): ReturnType<typeof pollToken> {
    return pollToken(portalBaseUrl, deviceCode, expiresIn, interval);
  }

  buildAuthState(
    tokenData: Record<string, unknown>,
  ): ReturnType<typeof buildAuthState> {
    return buildAuthState(tokenData);
  }
}
```

---

# ── src/oauth/pkce-loopback.ts ───────────────────────────────

```typescript
/**
 * PKCE Loopback OAuth — Authorization Code with PKCE + local callback.
 * Used by xAI Grok OAuth and similar.
 *
 * Flow:
 * 1. Generate PKCE challenge + verifier
 * 2. Discover OIDC config from provider .well-known endpoint
 * 3. Start local callback server on a free port
 * 4. Redirect user to authorization URL
 * 5. Receive callback with auth code → exchange for tokens
 * 6. Clean up local server
 *
 * For web frontend, this flow can't run in the browser context
 * because it needs a local callback server. Use the two-phase
 * login system only for user_code and device_code providers.
 */

import { createHash, randomBytes } from "node:crypto";

// ─── OIDC Discovery ───────────────────────────────────────────────

interface OidcConfig {
  authorization_endpoint: string;
  token_endpoint: string;
  issuer: string;
}

async function discoverOidcConfig(issuerUrl: string): Promise<OidcConfig> {
  const wellKnown = `${issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const res = await fetch(wellKnown);
  if (!res.ok)
    throw new Error(`OIDC discovery failed: ${res.statusText}`);
  return res.json() as Promise<OidcConfig>;
}

// ─── PKCE ─────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  const bytes = randomBytes(64);
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateCodeChallenge(verifier: string): string {
  const hash = createHash("sha256").update(verifier).digest();
  return hash
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ─── Loopback Server ──────────────────────────────────────────────

function startLoopbackServer(
  port: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = Bun.listen({
      port,
      hostname: "127.0.0.1",
      socket: {
        data(ws, data) {
          const text = data.toString();
          const match = text.match(/GET \/\?code=([^\s&]+)/);
          if (match) {
            resolve(match[1]!);
            ws.write(
              "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nAuthorization successful. You can close this tab.",
            );
            ws.end();
            server.stop();
          }
        },
        error(_, err) {
          reject(err);
        },
      },
    });
  });
}

// ─── Public Class ──────────────────────────────────────────────────

export class PkceLoopbackOAuthProvider {
  async login(
    portalBaseUrl: string,
    clientId: string,
    scope: string = "openid profile email",
    redirectPort?: number,
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }> {
    const config = await discoverOidcConfig(portalBaseUrl);
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = randomBytes(16).toString("hex");
    const port = redirectPort ?? 0; // 0 = random

    // Start callback server
    const server = Bun.listen({
      port,
      hostname: "127.0.0.1",
      socket: {
        data(ws, data) {
          const text = data.toString();
          const match = text.match(/GET \/\?code=([^\s&]+)/);
          if (match) {
            resolveCallback(match[1]!);
            ws.write(
              "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nAuthorization successful. You can close this tab.",
            );
            ws.end();
            server.stop();
          }
        },
        error(_, err) {
          rejectCallback(err);
        },
      },
    });

    const actualPort = server.port;
    const redirectUri = `http://127.0.0.1:${actualPort}`;

    let resolveCallback: (code: string) => void = () => {};
    let rejectCallback: (err: Error) => void = () => {};
    const callbackPromise = new Promise<string>((resolve, reject) => {
      resolveCallback = resolve;
      rejectCallback = reject;
    });

    // Build authorization URL
    const authUrl = `${config.authorization_endpoint}?` +
      `response_type=code&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&code_challenge=${codeChallenge}&code_challenge_method=S256` +
      `&scope=${encodeURIComponent(scope)}&state=${state}`;

    console.log(`Open this URL in your browser:\n${authUrl}`);

    // Wait for callback (with timeout)
    const timeout = 5 * 60 * 1000;
    const authCode = await Promise.race([
      callbackPromise,
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("OAuth timeout")), timeout),
      ),
    ]);

    // Exchange code for tokens
    const tokenRes = await fetch(config.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok)
      throw new Error(`Token exchange failed: ${tokenData.error_description ?? tokenRes.statusText}`);

    server.stop();
    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in ?? 3600,
    };
  }
}

// Helper
let _callbackResolve: ((code: string) => void) | null = null;
let _callbackReject: ((err: Error) => void) | null = null;
