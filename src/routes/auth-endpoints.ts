/**
 * Auth API endpoints: register, login, refresh, logout.
 *
 * Password-based authentication with opaque session + refresh token model.
 * Sessions are short-lived (30 min sliding), refresh tokens last 7 days
 * with rotation-based renewal and theft detection.
 */

import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import z from 'zod'

import { db } from '../db'
import { users } from '../db/schema'
import {
  createSessionPair,
  deleteSessionByToken,
  rotateRefreshToken,
  verifySession
} from '../auth/session-store'
import { createUser, getUserByEmail } from '../auth/user-store'

// ─── Request Schemas ───────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().max(100).optional()
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
})

const logoutSchema = z.object({
  refreshToken: z.string().optional()
})

// ─── Router ────────────────────────────────────────────────────────

export const authEndpointsRouter = new Hono()

  // ── POST /register ──────────────────────────────────────────────
  .post(
    '/register',
    zValidator('json', registerSchema),
    async c => {
      const { email, password, displayName } = c.req.valid('json')

      // Check for existing user
      const existing = await getUserByEmail(email)
      if (existing) {
        return c.json({ error: 'Email already registered' }, 409)
      }

      // Hash password using Bun's built-in bcrypt
      const passwordHash = await Bun.password.hash(password)

      // Create user
      const user = await createUser(email, displayName, passwordHash)

      return c.json(
        {
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName
          }
        },
        201
      )
    }
  )

  // ── POST /login ─────────────────────────────────────────────────
  .post(
    '/login',
    zValidator('json', loginSchema),
    async c => {
      const { email, password } = c.req.valid('json')

      // Look up user
      const user = await getUserByEmail(email)
      if (!user) {
        return c.json({ error: 'Invalid email or password' }, 401)
      }

      // Get password hash from DB — getUserByEmail doesn't return it
      const [userRow] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1)

      if (!userRow?.passwordHash) {
        return c.json(
          { error: 'Account has no password set (OAuth-only?). Please use your OAuth provider.' },
          401
        )
      }

      // Verify password using Bun's built-in bcrypt verify
      const valid = await Bun.password.verify(password, userRow.passwordHash)
      if (!valid) {
        return c.json({ error: 'Invalid email or password' }, 401)
      }

      // Create session + refresh token pair
      const pair = await createSessionPair(user.id)

      return c.json({
        sessionToken: pair.session.rawToken,
        refreshToken: pair.refreshToken.raw,
        expiresIn: 30 * 60, // seconds (matching SESSION_DURATION_MS)
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName
        }
      })
    }
  )

  // ── POST /refresh ───────────────────────────────────────────────
  .post(
    '/refresh',
    zValidator('json', refreshSchema),
    async c => {
      const { refreshToken } = c.req.valid('json')

      try {
        const pair = await rotateRefreshToken(refreshToken)

        return c.json({
          sessionToken: pair.session.rawToken,
          refreshToken: pair.refreshToken.raw,
          expiresIn: 30 * 60
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Refresh failed'
        // Theft detection or expired token
        return c.json({ error: message }, 401)
      }
    }
  )

  // ── POST /logout ────────────────────────────────────────────────
  .post(
    '/logout',
    zValidator('json', logoutSchema),
    async c => {
      // Get session token from Authorization header
      const authHeader = c.req.header('Authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: 'Missing or malformed Authorization header' }, 401)
      }

      const sessionToken = authHeader.slice(7).trim()
      if (!sessionToken) {
        return c.json({ error: 'Empty session token' }, 401)
      }

      // Verify the session is valid (also updates lastActiveAt via sliding expiry)
      const session = await verifySession(sessionToken)
      if (!session) {
        return c.json({ error: 'Invalid or expired session' }, 401)
      }

      // Delete the session
      await deleteSessionByToken(sessionToken)

      return c.json({ message: 'Logged out successfully' })
    }
  )
