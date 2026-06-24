// oxlint-disable typescript/no-redundant-type-constituents
import z from 'zod'

import type { ErrorCode } from '../lib/error-codes'

export const AuthType = z.enum([
  'api_key',
  'oauth_device_code',
  'oauth_authorization_code',
  'oauth_user_code',
  'oauth_external',
  'copilot',
  'exeternal_process',
  'aws_sdk',
  'free',
  'none'
])
export type AuthType = z.infer<typeof AuthType>

export const ApiMode = z.enum([
  'chat_completions',
  'anthropic_messages',
  'codex_responses',
  'bedrock_converse'
])

export type ApiMode = z.infer<typeof ApiMode>

export type OAuthFlowType =
  | 'authorization_code'
  | 'device_code'
  | 'user_code'
  | 'exeternal_process'
  | 'pkce_loopback'

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
  oauthConfig: z.record(z.string(), z.unknown()).nullable().default(null),
  apiKey: z.string().default('')
})

export type ProviderProfileData = z.infer<typeof ProviderProfileDataSchema>

export interface ProviderHooks {
  getApiKey?: (providerName: string) => Promise<string | null>
  getApiBase?: (providerName: string) => Promise<string | null>
  getModels?: (providerName: string) => Promise<string[] | null>
  getApiType?: (providerName: string) => Promise<string | null>
}

export interface ProviderProfile extends ProviderProfileData {
  hooks?: ProviderHooks
}

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

export interface AuthStatus {
  loggedIn: boolean
  provider: string
  region?: string
  expiresAt?: string
  authType: AuthType
  hasRefreshToken?: boolean
  cientId?: string
  scope?: string
  apiBaseUrl?: string
  errror?: string
}
export interface ModelsResponse {
  models: string[]
  providerName: string
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
export class AuthError extends Error {
  public readonly provider: string
  public readonly code: ErrorCode | string
  public readonly reloginRequired?: boolean

  constructor(
    message: string,
    opts: {
      provider: string
      code: ErrorCode | string
      reloginRequired?: boolean
    }
  ) {
    super(message)
    this.name = 'AuthError'
    this.provider = opts.provider
    this.code = opts.code
    this.reloginRequired = opts.reloginRequired
  }
}
