/**
 * Config Schema — Zod-validated typed configuration.
 *
 * Mirrors Hermes' DEFAULT_CONFIG (~60+ keys across 12 sections).
 * This is the single source of truth for all configurable aspects
 * of the server. Every config key is documented, typed, and has a
 * sensible default.
 */

import { z } from 'zod'

// ─── Provider overrides ───────────────────────────────────────────

const ProviderOverrideSchema = z.object({
  baseUrl: z.string().optional(),
  requestTimeoutSeconds: z.number().positive().optional(),
  models: z
    .record(
      z.string(),
      z.object({
        timeoutSeconds: z.number().positive().optional()
      })
    )
    .optional()
})

// ─── Credential pool ──────────────────────────────────────────────

const CredentialPoolStrategy = z.enum([
  'fill_first',
  'round_robin',
  'least_used',
  'random'
])

const CredentialPoolStrategiesSchema = z
  .record(z.string(), CredentialPoolStrategy.default('fill_first'))
  .default({})
  .describe('Per-provider credential pool selection strategies')

// ─── Custom providers ─────────────────────────────────────────────

const CustomProviderSchema = z.object({
  name: z.string().min(1).describe('Provider identifier'),
  displayName: z.string().optional().describe('Human-readable name'),
  baseUrl: z.url().describe('API base URL'),
  apiKey: z.string().optional().describe('API key (or use apiKeyEnv)'),
  apiKeyEnv: z.string().optional().describe('Env var containing the API key'),
  apiMode: z
    .enum([
      'chat_completions',
      'anthropic_messages',
      'codex_responses',
      'bedrock_converse'
    ])
    .default('chat_completions')
    .describe('API transport mode'),
  defaultModel: z.string().optional().describe('Default model name'),
  description: z.string().optional().describe('User-facing description')
})

// ─── Main config schema ───────────────────────────────────────────

export const ConfigSchema = z.object({
  // ── Server ──────────────────────────────────────────────────
  port: z.coerce.number().int().positive().default(3000),
  host: z.string().default('127.0.0.1'),

  // ── Auth ────────────────────────────────────────────────────
  apiKey: z.string().optional(),

  // ── Database ────────────────────────────────────────────────
  databaseUrl: z.string().default('postgres://localhost:5432/provider-oauth'),

  // ── Default timeouts ────────────────────────────────────────
  requestTimeoutSeconds: z.number().positive().default(60),
  streamTimeoutSeconds: z.number().positive().default(300),

  // ── Providers ───────────────────────────────────────────────
  fallbackProviders: z.array(z.string()).default([]),
  providers: z.record(z.string(), ProviderOverrideSchema).optional(),

  // ── Credential pool ─────────────────────────────────────────
  credentialPoolStrategies: CredentialPoolStrategiesSchema,

  // ── Custom providers ────────────────────────────────────────
  customProviders: z.array(CustomProviderSchema).default([]),

  // ── CORS ────────────────────────────────────────────────────
  corsOrigins: z.array(z.string()).default([]),

  // ── Rate limiting ───────────────────────────────────────────
  rateLimitRequestsPerWindow: z.coerce.number().int().positive().default(60),
  rateLimitWindowSeconds: z.coerce.number().int().positive().default(60),
  rateLimitPerKey: z.coerce.boolean().default(false),

  // ── Network ─────────────────────────────────────────────────
  forceIpv4: z.coerce.boolean().default(false),

  // ── Security ────────────────────────────────────────────────
  bodySizeLimit: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024), // 10MB
  enableSecurityHeaders: z.coerce.boolean().default(true),
  enableRateLimiting: z.coerce.boolean().default(false),

  // ── Logging ─────────────────────────────────────────────────
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info')
})

export type Config = z.infer<typeof ConfigSchema>

// ─── Partial config for deep-merge support ────────────────────────

export type PartialConfig = z.input<typeof ConfigSchema>

// ─── Config validation ────────────────────────────────────────────

/**
 * Validate and return a parsed Config object.
 * Throws on invalid config with a descriptive Zod error.
 */
export function validateConfig(raw: unknown): Config {
  const result = ConfigSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Config validation failed:\n${issues}`)
  }
  return result.data
}
