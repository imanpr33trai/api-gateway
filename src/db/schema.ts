/**
 * Drizzle ORM schema for the provider + credentials tables.
 * PostgreSQL dialect — uses pgTable, serial, jsonb, etc.
 *
 * Multi-tenant: users, api_keys, and user_credentials tables
 * let each registered user manage their own provider credentials.
 */

import { sql } from 'drizzle-orm'
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import type { z } from 'zod'

// ─── Users Table ───────────────────────────────────────────────────

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull().default(''),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('user'), // "user" | "admin"
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export const userInsertSchema = createInsertSchema(users)
export type UserInsert = z.infer<typeof userInsertSchema>
export const userSelect = createSelectSchema(users)
export type UserSelect = z.infer<typeof userSelect>

// ─── Sessions Table ────────────────────────────────────────────────
// Opaque session tokens (sess_ prefix), SHA-256 hashed for DB storage.
// Sessions are short-lived (15-60 min) with sliding expiry.

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  lastActiveAt: timestamp('last_active_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow()
})

export const sessionInsertSchema = createInsertSchema(sessions)
export type SessionInsert = z.infer<typeof sessionInsertSchema>
export const sessionSelectSchema = createSelectSchema(sessions)
export type SessionSelect = z.infer<typeof sessionSelectSchema>

// ─── Refresh Tokens Table ──────────────────────────────────────────
// Rotation model: on /refresh, mark old token as is_used=true,
// issue new session+refresh pair. If a rotated token is replayed
// → theft detection (revoke all user sessions).
// Tokens stored as SHA-256 hash (ref_ prefix), never plaintext in DB.

export const refreshTokens = pgTable('refresh_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  sessionId: integer('session_id').references(() => sessions.id, {
    onDelete: 'set null'
  }),
  tokenHash: text('token_hash').notNull(),
  isUsed: boolean('is_used').notNull().default(false),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow()
})

export const refreshTokenInsertSchema = createInsertSchema(refreshTokens)
export type RefreshTokenInsert = z.infer<typeof refreshTokenInsertSchema>
export const refreshTokenSelectSchema = createSelectSchema(refreshTokens)
export type RefreshTokenSelect = z.infer<typeof refreshTokenSelectSchema>

// ─── API Keys Table ────────────────────────────────────────────────
// Each user can have multiple API keys for different environments.
// Keys are stored hashed (SHA-256); only the prefix is stored in plaintext.

export const apiKeys = pgTable('api_keys', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  keyHash: text('key_hash').notNull(),
  keyPrefix: text('key_prefix').notNull(), // first 8 chars of sk-... for display
  label: text('label').notNull().default('default'),
  scopes: jsonb('scopes')
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow()
})

export const apiKeyInsertSchema = createInsertSchema(apiKeys)
export type ApiKeyInsert = z.infer<typeof apiKeyInsertSchema>

// ─── User Credentials Table ────────────────────────────────────────
// Per-user OAuth/provider credentials. Replaces the global credentials table.
// One credential row per (userId, providerName) pair.

export const userCredentials = pgTable(
  'user_credentials',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerName: text('provider_name').notNull(),
    portalBaseUrl: text('portal_base_url').notNull().default(''),
    inferenceBaseUrl: text('inference_base_url').notNull().default(''),
    clientId: text('client_id').notNull().default(''),
    scope: text('scope').notNull().default(''),
    tokenType: text('token_type').notNull().default('Bearer'),
    accessToken: text('access_token').notNull().default(''),
    refreshToken: text('refresh_token'),
    region: text('region'),
    obtainedAt: timestamp('obtained_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at'),
    expiresIn: integer('expires_in').notNull().default(0),
    lastAuthError: jsonb('last_auth_error').$type<Record<
      string,
      unknown
    > | null>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  table => [
    uniqueIndex('user_provider_unique').on(table.userId, table.providerName)
  ]
)

export const userCredentialInsertSchema = createInsertSchema(userCredentials)
export type UserCredentialInsert = z.infer<typeof userCredentialInsertSchema>

export const userCredentialSelectSchema = createSelectSchema(userCredentials)
export type UserCredentialSelect = z.infer<typeof userCredentialSelectSchema>
// ─── Providers Table ──────────────────────────────────────────────

export const providers = pgTable('providers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  apiMode: text('api_mode', {
    enum: [
      'chat_completions',
      'anthropic_messages',
      'codex_responses',
      'bedrock_converse'
    ]
  })
    .notNull()
    .default('chat_completions'),
  aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
  displayName: text('display_name').notNull().default(''),
  description: text('description').notNull().default(''),
  signupUrl: text('signup_url').notNull().default(''),
  envVars: jsonb('env_vars').$type<string[]>().notNull().default([]),
  baseUrl: text('base_url').notNull().default(''),
  modelsUrl: text('models_url').notNull().default(''),
  authType: text('auth_type').notNull().default('api_key'),
  supportsHealthCheck: boolean('supports_health_check').notNull().default(true),
  hostname: text('hostname').notNull().default(''),
  fallbackModels: jsonb('fallback_models')
    .$type<string[]>()
    .notNull()
    .default([]),
  defaultHeaders: jsonb('default_headers')
    .$type<Record<string, string>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  fixedTemperature: real('fixed_temperature'),
  defaultMaxTokens: integer('default_max_tokens'),
  defaultAuxModel: text('default_aux_model').notNull().default(''),
  oauthConfig: jsonb('oauth_config').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  apiKey: text('api_key').notNull().default(''),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export const providerInsertSchema = createInsertSchema(providers)
export type ProviderInsert = z.infer<typeof providerInsertSchema>

// ─── Legacy Credentials Table (deprecated — use user_credentials) ──

export const credentials = pgTable('credentials', {
  id: serial('id').primaryKey(),
  providerName: text('provider_name').notNull().unique(),
  portalBaseUrl: text('portal_base_url').notNull().default(''),
  inferenceBaseUrl: text('inference_base_url').notNull().default(''),
  clientId: text('client_id').notNull().default(''),
  scope: text('scope').notNull().default(''),
  tokenType: text('token_type').notNull().default('Bearer'),
  accessToken: text('access_token').notNull().default(''),
  refreshToken: text('refresh_token'),
  region: text('region'),
  obtainedAt: timestamp('obtained_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at'),
  expiresIn: integer('expires_in').notNull().default(0),
  lastAuthError: jsonb('last_auth_error').$type<Record<
    string,
    unknown
  > | null>(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

// ─── Provider Models Cache ────────────────────────────────────────

export const providerModels = pgTable('provider_models', {
  id: serial('id').primaryKey(),
  providerName: text('provider_name').notNull().unique(),
  models: jsonb('models').$type<string[]>().notNull().default([]),
  source: text('source', {
    enum: ['live', 'fallback', 'error']
  })
    .notNull()
    .default('fallback'),
  fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
  error: text('error')
})
