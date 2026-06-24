/**
 * Env Var Manager — manages .env file loading and validation.
 *
 * Features:
 *   - Auto-loads `.env` at startup via `dotenv`
 *   - Validates env var names against denylist (can't write dangerous vars)
 *   - Provides typed access to env vars
 *   - Lazy-loaded singleton
 */

import 'dotenv/config'

// ─── Denylist ─────────────────────────────────────────────────────

/**
 * Environment variables that should NEVER be written via config
 * or managed by this app (security-sensitive system vars).
 */
const ENV_DENYLIST = new Set([
  'LD_PRELOAD',
  'PYTHONPATH',
  'PYTHONHOME',
  'BASH_ENV',
  'ENV',
  'PROMPT_COMMAND',
  'LD_LIBRARY_PATH',
  'LD_LOAD_FLAGS',
  'SHELL',
  'PATH'
])

/**
 * Check if an env var name is denied for writing.
 */
export function isDeniedEnvVar(name: string): boolean {
  return ENV_DENYLIST.has(name)
}

// ─── Env reading ──────────────────────────────────────────────────

/**
 * Get an env var value. Returns `fallback` if not set.
 * `dotenv` handles `.env` loading at import time.
 */
export function getEnv(key: string, fallback?: string): string | undefined {
  return process.env[key] ?? fallback
}

/**
 * Get a required env var. Throws if not set.
 */
export function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(
      `Required environment variable '${key}' is not set. ` +
        `Check .env or your environment.`
    )
  }
  return value
}

/**
 * Get an env var as a number.
 */
export function getEnvNumber(
  key: string,
  fallback?: number
): number | undefined {
  const value = process.env[key]
  if (value === undefined) return fallback
  const n = Number(value)
  return Number.isNaN(n) ? fallback : n
}

/**
 * Get an env var as a boolean (true for "1", "true", "yes", "on").
 */
export function getEnvBoolean(
  key: string,
  fallback?: boolean
): boolean | undefined {
  const value = process.env[key]
  if (value === undefined) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

/**
 * Get an env var as a JSON-parsed array.
 * Falls back to splitting by comma if JSON parse fails.
 */
export function getEnvArray(
  key: string,
  fallback?: string[]
): string[] | undefined {
  const value = process.env[key]
  if (!value) return fallback
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {
    // Not JSON — split by comma
  }
  return value.split(',').map(s => s.trim())
}
