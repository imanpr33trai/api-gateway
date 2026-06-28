/**
 * Provider type definitions — mirrors Hermes Agent ProviderProfile schema.
 *
 * This file defines all types used across the project: provider profiles,
 * OAuth configs, auth types, requests, and API modes.
 */

import { z } from 'zod'

// ─── Auth Types ───────────────────────────────────────────────────

/**
 * All supported authentication types, mirroring Hermes' auth_type field.
 *
 * - api_key: static API key (OpenAI, OpenRouter, DeepSeek, etc.)
 * - oauth_device_code: OAuth 2.0 Device Authorization Grant (Nous)
 * - oauth_authorization_code: OAuth 2.0 PKCE loopback (xAI)
 * - oauth_user_code: User-code grant (MiniMax)
 * - oauth_external: External managed OAuth flow (OpenAI Codex, Qwen)
 * - copilot: GitHub Copilot token auth
 * - external_process: External CLI process manages auth (copilot-acp)
 * - aws_sdk: AWS SDK credential chain (Bedrock)
 * - none: No authentication required (local providers like Ollama, LM Studio)
 */
export const AuthType = z.enum([
  'api_key',
  'oauth_device_code',
  'oauth_authorization_code',
  'oauth_user_code',
  'oauth_external',
  'copilot',
  'external_process',
  'aws_sdk',
  'oauth_minimax',
  'none',
  'free'
])
export type AuthType = z.infer<typeof AuthType>

// ─── API Modes ────────────────────────────────────────────────────

/**
 * All supported API modes, mirroring Hermes' api_mode field.
 *
 * - chat_completions: OpenAI-compatible /v1/chat/completions
 * - anthropic_messages: Anthropic Messages API
 * - codex_responses: OpenAI Responses API (/v1/responses)
 * - bedrock_converse: AWS Bedrock Converse API
 */
export const ApiMode = z.enum([
  'chat_completions',
  'anthropic_messages',
  'codex_responses',
  'bedrock_converse'
])
export type ApiMode = z.infer<typeof ApiMode>

// ─── OAuth Flow Types ─────────────────────────────────────────────

export const OAuthFlowType = z.enum([
  'authorization_code',
  'device_code',
  'user_code',
  'external_process'
])
export type OAuthFlowType = z.infer<typeof OAuthFlowType>

// ─── Provider Profile Schema ──────────────────────────────────────

/**
 * OAuth provider configuration — mirrors Hermes' OAuthProvider dataclass.
 */
export const OAuthProviderConfigSchema = z.object({
  flowType: OAuthFlowType,
  clientId: z.string(),
  portalBaseUrl: z.string(),
  tokenEndpoint: z.string().optional(),
  authorizationEndpoint: z.string().optional(),
  scope: z.string().optional(),
  redirectHost: z.string().default('127.0.0.1'),
  redirectPort: z.number().default(0),
  redirectPath: z.string().default('/callback'),
  codeChallengeMethod: z.enum(['S256', 'plain']).default('S256'),
  supportsRefresh: z.boolean().default(false),
  supportsManualPaste: z.boolean().default(false),
  issuer: z.string().optional(),
  pollIntervalMs: z.number().default(2000),
  refreshSkewSeconds: z.number().default(60),
  audioNotificationUrl: z.string().optional(),
  externalPollUrl: z.string().optional()
})

export type OAuthProviderConfig = z.infer<typeof OAuthProviderConfigSchema>

/**
 * Full provider profile — mirrors Hermes' ProviderProfile dataclass.
 * This is the canonical type for both DB and in-memory use.
 */
export const ProviderProfileDataSchema = z.object({
  name: z.string().min(1),
  apiMode: ApiMode.default('chat_completions'),
  aliases: z.array(z.string()).default([]),
  displayName: z.string().default(''),
  description: z.string().default(''),
  signupUrl: z.string().default(''),
  envVars: z.array(z.string()).default([]),
  baseUrl: z.string().default(''),
  modelsUrl: z.string().default(''),
  authType: AuthType.default('api_key'),
  supportsHealthCheck: z.boolean().default(true),
  hostname: z.string().default(''),
  fallbackModels: z.array(z.string()).default([]),
  defaultHeaders: z.record(z.string(), z.string()).default({}),
  fixedTemperature: z.number().nullable().default(null),
  defaultMaxTokens: z.number().nullable().default(null),
  defaultAuxModel: z.string().default(''),
  oauthConfig: z.record(z.string(), z.unknown()).nullable().default(null)
})

export type ProviderProfileData = z.infer<typeof ProviderProfileDataSchema>

/**
 * Provider profile with runtime hooks — extends the Zod schema
 * with callable hook methods that cannot be serialized.
 */
export interface ProviderProfile extends ProviderProfileData {
  hooks?: ProviderProfileHooks
}

// ─── Request Schemas ──────────────────────────────────────────────

export const AuthLoginRequestSchema = z.object({
  provider: z.string().min(1),
  region: z.string().optional(),
  openBrowser: z.boolean().default(true),
  manualPaste: z.boolean().default(false),
  timeoutSeconds: z.number().int().positive().default(120)
})

export type AuthLoginRequest = z.infer<typeof AuthLoginRequestSchema>

export const AuthRefreshRequestSchema = z.object({
  provider: z.string().min(1)
})

export type AuthRefreshRequest = z.infer<typeof AuthRefreshRequestSchema>

// ─── Auth State ────────────────────────────────────────────────────

/**
 * OAuth auth state stored after successful login.
 */
export interface OAuthAuthState {
  provider: string
  portalBaseUrl: string
  inferenceBaseUrl: string
  clientId: string
  scope: string
  tokenType: string
  accessToken: string
  refreshToken?: string
  region?: string
  obtainedAt: string
  expiresAt?: string
  expiresIn: number
  lastAuthError?: {
    provider: string
    code: string
    message: string
    reason?: string
    reloginRequired?: boolean
    at: string
  }
}

// ─── Auth Status ──────────────────────────────────────────────────

export interface AuthStatus {
  loggedIn: boolean
  provider: string
  region?: string
  expiresAt?: string
  authType: string
  hasRefreshToken?: boolean
  clientId?: string
  scope?: string
  apiBaseUrl?: string
  error?: string
}

// ─── Token Provider ───────────────────────────────────────────────

export type TokenProvider = () => Promise<string>

// ─── Temperature Sentinel ──────────────────────────────────────────

/**
 * Sentinel value that providers can assign to fixedTemperature to indicate
 * temperature is not supported (e.g., Copilot, certain Bedrock models).
 * Checking `profile.fixedTemperature === OMIT_TEMPERATURE` skips the
 * temperature parameter entirely rather than sending a value of 0.
 */
export const OMIT_TEMPERATURE = Symbol('OMIT_TEMPERATURE')

// ─── Reasoning Config ───────────────────────────────────────────────

export interface ReasoningConfig {
  enabled: boolean
  effort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
}

// ─── Provider Profile Hooks ────────────────────────────────────────

/** OpenAI-compatible chat completion request shape. */
export interface ChatCompletionRequest {
  model: string
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool'
    content:
      | string
      | Array<{
          type: string
          text?: string
          image_url?: Record<string, unknown>
        }>
    name?: string
    tool_call_id?: string
    tool_calls?: Array<{
      id: string
      type: 'function'
      function: { name: string; arguments: string }
    }>
  }>
  temperature?: number
  max_tokens?: number
  stream?: boolean
  reasoningConfig?: ReasoningConfig
  sessionId?: string
  providerPreferences?: Record<string, unknown>
  [key: string]: unknown
}

/** OpenAI-compatible chat completion delta chunk shape (for stream). */
export interface ChatCompletionDelta {
  role?: string
  content?: string
  reasoning?: string
  reasoning_content?: string
  tool_calls?: Array<{
    index: number
    id?: string
    function?: { name?: string; arguments?: string }
  }>
}

/**
 * Provider-specific hook methods — ported from Hermes Agent Python's
 * ProviderProfile dataclass hooks. These are called at request time
 * by the transport layer to customize messages, extra_body, api_kwargs,
 * max_tokens, and model fetching per provider.
 *
 * These are runtime callbacks and cannot be serialized to JSON/DB.
 */
export interface ProviderProfileHooks {
  /** Provider-specific message preprocessing, called AFTER field sanitization */
  prepareMessages?: (
    messages: ChatCompletionRequest['messages']
  ) => ChatCompletionRequest['messages']

  /** Provider-specific extra_body additions (session_id, provider_prefs, etc.) */
  buildExtraBody?: (context: {
    sessionId?: string
    model?: string
    providerPreferences?: Record<string, unknown>
  }) => Record<string, unknown>

  /** Provider-specific kwargs split between extra_body and top-level api_kwargs */
  buildApiKwargsExtras?: (context: {
    reasoningConfig?: ReasoningConfig
    supportsReasoning?: boolean
    model?: string
    sessionId?: string
    [key: string]: unknown
  }) => {
    extraBody: Record<string, unknown>
    topLevel: Record<string, unknown>
  }

  /** Per-model max_tokens override */
  getMaxTokens?: (model: string | null) => number | null

  /** Custom models endpoint fetch with per-provider auth */
  fetchModels?: (opts: {
    apiKey?: string | null
    timeout?: number
  }) => Promise<string[] | null>
}

/**
 * Hooks allow a provider to override how API keys, base URLs, and
 * model lists are resolved at runtime.
 *
 * getApiKey    → dynamic API key resolution (e.g., via gcloud, token refresh)
 * getApiBase   → dynamic base URL override
 * getModels    → dynamic model listing
 * getApiType   → dynamic api_mode override
 */
export interface ProviderHooks {
  getApiKey?: (providerName: string) => Promise<string | null>
  getApiBase?: (providerName: string) => Promise<string | null>
  getModels?: (providerName: string) => Promise<string[] | null>
  getApiType?: (providerName: string) => Promise<string | null>
}

// ─── API Route Response Types ─────────────────────────────────────

export interface ModelsResponse {
  models: string[]
  provider: string
  source: 'live' | 'fallback' | 'error'
  error?: string
}

export interface ModelCheckRequest {
  provider: string
  model: string
  prompt?: string
}

export interface ModelCheckResponse {
  model: string
  provider: string
  available: boolean
  latencyMs?: number
  error?: string
}

// ─── Error Types ──────────────────────────────────────────────────

export class AuthError extends Error {
  public readonly provider: string
  public readonly code: string
  public readonly reloginRequired?: boolean

  constructor(
    message: string,
    opts: { provider: string; code: string; reloginRequired?: boolean }
  ) {
    super(message)
    this.name = 'AuthError'
    this.provider = opts.provider
    this.code = opts.code
    this.reloginRequired = opts.reloginRequired
  }
}
