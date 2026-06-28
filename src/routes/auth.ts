/**
 * Auth Routes — OAuth login, refresh, status, logout, two-phase login
 *
 * Multi-tenant: resolves userId from the authenticated user context
 * (set by apiKeyAuth middleware). Falls back to userId=0 (legacy) when
 * the server is running in single-tenant mode.
 *
 * Two-phase login (for web frontends):
 *   POST /api/auth/login/start → { sessionId, userCode, verificationUri, ... }
 *   GET  /api/auth/login/status/:id → { status: "pending" | "success" | "error", ... }
 */

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

import * as authEngine from '../auth/engine'
import { getLoginStatus, startLogin } from '../auth/login-session'
import {
  createApiKey,
  createUser,
  getUserByEmail,
  resolveUserFromApiKey
} from '../auth/user-store'
import { userInsertSchema } from '../db/schema'
import { getUserId } from '../middleware/api-key-auth'
import { listProviders } from '../providers/registry'
import {
  AuthLoginRequestSchema,
  AuthRefreshRequestSchema
} from '../providers/types'

export const authRouter = new Hono()

// ─── User signup (no auth required) ───────────────────────────────

/**
 * POST /api/auth/signup — create a user account and return an API key.
 *
 * The API key is returned once; the user must store it. It's hashed
 * in the DB and cannot be recovered.
 */
authRouter.post(
  '/signup',
  zValidator('json', userInsertSchema.pick({ email: true, displayName: true })),
  async c => {
    const { email, displayName } = c.req.valid('json')

    try {
      // Check if user already exists
      const existing = await getUserByEmail(email)
      if (existing) {
        return c.json({ error: 'Email already registered' }, 409)
      }

      const user = await createUser(email, displayName)
      const apiKey = await createApiKey(user.id, 'token-store')

      return c.json({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName
        },
        apiKey: {
          key: apiKey.rawKey,
          prefix: apiKey.record.keyPrefix,
          label: apiKey.record.label
        },
        message:
          'Save this API key — it will not be shown again. ' +
          'Use it as the Bearer token in Authorization headers.'
      })
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Signup failed' },
        400
      )
    }
  }
)

/**
 * POST /api/auth/verify — verify an API key and return user info.
 * Useful for the frontend to check if a stored key is still valid.
 */
authRouter.post(
  '/verify',
  zValidator(
    'json',
    z.object({
      apiKey: z.string().min(10)
    })
  ),
  async c => {
    const { apiKey } = c.req.valid('json')

    try {
      const result = await resolveUserFromApiKey(apiKey)
      if (!result) {
        return c.json(
          { valid: false, error: 'Invalid or expired API key' },
          401
        )
      }

      return c.json({
        valid: true,
        user: {
          id: result.user.id,
          email: result.user.email,
          displayName: result.user.displayName
        }
      })
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Verification failed' },
        400
      )
    }
  }
)

// ─── Two-phase login (web frontend) ───────────────────────────────

/**
 * POST /api/auth/login/start — initiate an OAuth login flow.
 * Returns intermediate data (userCode, verificationUri) immediately,
 * so the frontend can display them to the user.
 */
authRouter.post(
  '/login/start',
  zValidator(
    'json',
    z.object({
      provider: z.string(),
      region: z.string().optional().default('global')
    })
  ),
  async c => {
    const { provider, region } = c.req.valid('json')
    const userId = getUserId(c) ?? 0

    try {
      const result = await startLogin(provider, region, userId)
      return c.json(result)
    } catch (err) {
      return c.json(
        {
          error: err instanceof Error ? err.message : 'Login start failed'
        },
        400
      )
    }
  }
)

/**
 * GET /api/auth/login/status/:sessionId — poll for login completion.
 */
authRouter.get('/login/status/:sessionId', async c => {
  const sessionId = c.req.param('sessionId')
  const status = getLoginStatus(sessionId)

  if (!status) {
    return c.json({ error: 'Session not found or expired' }, 404)
  }

  return c.json(status)
})

// ─── Atomic login (CLI, backward compat) ──────────────────────────

/**
 * POST /api/auth/login — run full OAuth login flow (blocks until done).
 * Returns success/expiry when the flow completes.
 */
authRouter.post(
  '/login',
  zValidator('json', AuthLoginRequestSchema),
  async c => {
    const { provider, region, openBrowser, manualPaste, timeoutSeconds } =
      c.req.valid('json')
    const userId = getUserId(c) ?? 0
    const authState = await authEngine.login(userId, provider, {
      manualPaste,
      openBrowser,
      region,
      timeoutSeconds
    })

    return c.json({
      expiresAt: authState.expiresAt,
      provider: authState.provider,
      region: authState.region,
      success: true
    })
  }
)

// ─── Token refresh ────────────────────────────────────────────────

/**
 * POST /api/auth/refresh — refresh OAuth token.
 */
authRouter.post(
  '/refresh',
  zValidator('json', AuthRefreshRequestSchema),
  async c => {
    const { provider } = c.req.valid('json')
    const userId = getUserId(c) ?? 0
    const authState = await authEngine.refresh(provider, userId)
    return c.json({
      expiresAt: authState.expiresAt,
      provider: authState.provider,
      success: true
    })
  }
)

// ─── Auth status & logout ─────────────────────────────────────────

/**
 * GET /api/auth/:provider/status — check auth status.
 */
authRouter.get('/:provider/status', async c => {
  const providerName = c.req.param('provider')
  const userId = getUserId(c) ?? 0
  const status = await authEngine.getStatus(userId, providerName)
  return c.json(status)
})

/**
 * POST /api/auth/:provider/logout — clear credentials.
 */
authRouter.post('/:provider/logout', async c => {
  const providerName = c.req.param('provider')
  const userId = getUserId(c) ?? 0
  await authEngine.logout(userId, providerName)
  return c.json({ provider: providerName, success: true })
})

// ─── Provider listing ─────────────────────────────────────────────

/**
 * GET /api/auth/providers — list OAuth providers.
 */
authRouter.get('/providers', async c => {
  const all = await listProviders()
  const oauthProviders = all.filter(p => p.authType.startsWith('oauth'))
  return c.json({
    providers: oauthProviders.map(p => ({
      authType: p.authType,
      displayName: p.displayName,
      name: p.name,
      oauthConfig: p.oauthConfig
    }))
  })
})
