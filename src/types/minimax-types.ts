import { z } from "zod"

// ── Regions ──────────────────────────────────────────────────────────────

export const Region = z.enum(["global", "cn"])
export type Region = z.infer<typeof Region>

// ── PKCE Pair ────────────────────────────────────────────────────────────

export const PkcePair = z.object({
  verifier: z.string().min(1),
  challenge: z.string().min(1),
  state: z.string().min(1),
})
export type PkcePair = z.infer<typeof PkcePair>

// ── User Code Response (POST /oauth/code) ───────────────────────────────

export const UserCodeResponse = z.object({
  user_code: z.string().min(1),
  verification_uri: z.string().url(),
  expired_in: z.number().int().positive(),
  interval: z.number().int().positive().optional(),
  state: z.string().min(1),
})
export type UserCodeResponse = z.infer<typeof UserCodeResponse>

// ── Token Polling Response (POST /oauth/token) ──────────────────────────

export const TokenSuccessPayload = z.object({
  status: z.literal("success"),
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expired_in: z.number().int().positive(),
  token_type: z.string().optional().default("Bearer"),
  resource_url: z.string().optional(),
  notification_message: z.string().optional(),
})
export type TokenSuccessPayload = z.infer<typeof TokenSuccessPayload>

export const TokenErrorPayload = z.object({
  status: z.literal("error"),
  base_resp: z
    .object({
      status_msg: z.string().optional(),
    })
    .optional(),
})
export type TokenErrorPayload = z.infer<typeof TokenErrorPayload>

export const TokenPendingPayload = z.object({
  status: z.string(),
})
export type TokenPendingPayload = z.infer<typeof TokenPendingPayload>

export const TokenResponse = z.discriminatedUnion("status", [
  TokenSuccessPayload,
  TokenErrorPayload,
  TokenPendingPayload,
])
export type TokenResponse = z.infer<typeof TokenResponse>

// ── Auth State (persisted shape) ────────────────────────────────────────

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
})
export type AuthState = z.infer<typeof AuthState>

// ── Runtime Credentials (resolved for inference) ────────────────────────

export const RuntimeCredentials = z.object({
  provider: z.literal("minimax-oauth"),
  api_key: z.string().min(1),
  base_url: z.string().url(),
  source: z.literal("oauth"),
})
export type RuntimeCredentials = z.infer<typeof RuntimeCredentials>

// ── Auth Status ─────────────────────────────────────────────────────────

export const AuthStatus = z.object({
  logged_in: z.boolean(),
  provider: z.literal("minimax-oauth"),
  region: Region.optional(),
  expires_at: z.string().datetime().optional(),
})
export type AuthStatus = z.infer<typeof AuthStatus>

// ── Error ───────────────────────────────────────────────────────────────

export class MinimaxOAuthError extends Error {
  public readonly reloginRequired: boolean

  constructor(
    message: string,
    options?: { reloginRequired?: boolean; cause?: unknown },
  ) {
    super(message, { cause: options?.cause })
    this.name = "MinimaxOAuthError"
    this.reloginRequired = options?.reloginRequired ?? false
  }
}

// ── Auth store interface (abstract persistence) ────────────────────────

export interface AuthStore {
  get(): Promise<AuthState | null>
  set(state: AuthState): Promise<void>
}