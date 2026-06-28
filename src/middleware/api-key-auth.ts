/**
 * API Key Auth Middleware — resolves the authenticated user from Bearer token.
 *
 * Multi-tenant: looks up the API key hash in the api_keys table, finds the
 * owning user, and sets `c.set('userId', userId)` for downstream handlers.
 *
 * Falls back to the legacy single-tenant `cfg.apiKey` check when no user
 * record matches (backward compatibility for server-configured keys).
 *
 * Public paths (health) bypass auth entirely.
 */

import { createMiddleware } from 'hono/factory'

import { resolveUserFromApiKey } from '../auth/user-store'
import { getConfig } from '../config'
import { buildOpenAIErrorBody } from '../lib/openai-error'

// ─── Paths that bypass auth ───────────────────────────────────────

const PUBLIC_PATHS = new Set([
  '/health',
  '/health/',
  '/v1/health',
  '/health/detailed',
  '/api/auth/signup',
  '/api/auth/verify',
  '/api/auth/login/status'
])

// ─── Hono context key for userId ─────────────────────────────────

export const USER_ID_KEY = 'userId'

/**
 * Helper to get the current authenticated user's ID from context.
 */
export function getUserId(c: any): number | null {
  return c.get(USER_ID_KEY) ?? null
}

// ─── Middleware ───────────────────────────────────────────────────

export const apiKeyAuth = createMiddleware(async (c, next) => {
  // Bypass for health/public paths
  if (PUBLIC_PATHS.has(c.req.path)) {
    await next()
    return
  }

  const authHeader = c.req.header('Authorization')

  // No Authorization header at all
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const cfg = getConfig()
    // If no apiKey is configured, allow through (dev mode, no auth needed)
    if (!cfg.apiKey) {
      await next()
      return
    }
    // API key is configured but not provided — reject
    return new Response(
      JSON.stringify(
        buildOpenAIErrorBody('Incorrect API key provided.', {
          code: 'invalid_api_key',
          status: 401
        })
      ),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer'
        }
      }
    )
  }

  const token = authHeader.slice(7) // remove "Bearer "

  // Try multi-tenant resolution first
  try {
    const resolved = await resolveUserFromApiKey(authHeader)
    if (resolved) {
      c.set(USER_ID_KEY, resolved.user.id)
      await next()
      return
    }
  } catch {
    // Fall through to legacy check
  }

  // Legacy fallback: single-tenant configured API key
  const cfg = getConfig()
  if (token === cfg.apiKey) {
    // Legacy mode — no user context
    await next()
    return
  }

  // Auth failed
  return new Response(
    JSON.stringify(
      buildOpenAIErrorBody('Incorrect API key provided.', {
        code: 'invalid_api_key',
        status: 401
      })
    ),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer'
      }
    }
  )
})
