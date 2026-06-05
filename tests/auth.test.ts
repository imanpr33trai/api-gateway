/**
 * Auth integration tests: register, login, refresh, logout.
 *
 * Covers:
 *   - Happy path (register → login → refresh → logout)
 *   - Wrong password / non-existent user
 *   - Expired session token
 *   - Concurrent refresh (theft detection — replay attack)
 *   - Edge cases (duplicate email, missing auth header, invalid tokens)
 */

import { describe, test, expect, afterAll } from 'bun:test'
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { authEndpointsRouter } from '../src/routes/auth-endpoints'
import { db } from '../src/db'
import { refreshTokens, sessions, users } from '../src/db/schema'

// ─── App Instance ────────────────────────────────────────────────────

const app = new Hono()
app.route('/auth', authEndpointsRouter)

// ─── Helpers ─────────────────────────────────────────────────────────

function jsonRequest(path: string, body: unknown, headers?: Record<string, string>) {
  return app.request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  }) as Promise<Response>
}

/** POST to path and return { res, data } — optionally with extra headers. */
async function authPost(path: string, body: unknown, headers?: Record<string, string>) {
  const res = await jsonRequest(path, body, headers)
  const data = (await res.json()) as Record<string, unknown>
  return { res, data }
}

const registerUser = (email: string, password: string) =>
  authPost('/auth/register', { email, password })

const loginUser = (email: string, password: string) =>
  authPost('/auth/login', { email, password })

// ─── Suite ──────────────────────────────────────────────────────────

describe('Auth Integration Tests', () => {
  const testEmail = `auth-test-${Date.now()}@example.com`
  const testPassword = 'Str0ng!Pass#42'

  // Track user id so we can clean up in afterAll
  let userId: number | undefined
  let sessionToken: string | undefined
  let refreshToken: string | undefined

  afterAll(async () => {
    if (userId != null) {
      await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId))
      await db.delete(sessions).where(eq(sessions.userId, userId))
      await db.delete(users).where(eq(users.id, userId))
    }
  })

  // ═════════════════════════════════════════════════════════════════
  //  HAPPY PATH
  // ═════════════════════════════════════════════════════════════════

  test('POST /auth/register — creates a new user', async () => {
    const { res, data } = await registerUser(testEmail, testPassword)

    expect(res.status).toBe(201)
    expect(data.user).toBeDefined()
    expect((data.user as Record<string, unknown>).email).toBe(testEmail)
    userId = (data.user as Record<string, unknown>).id as number
    expect(userId).toBeGreaterThan(0)
  })

  test('POST /auth/register — duplicate email returns 409', async () => {
    const { res, data } = await registerUser(testEmail, testPassword)

    expect(res.status).toBe(409)
    expect(typeof data.error).toBe('string')
    expect((data.error as string).toLowerCase()).toContain('already registered')
  })

  test('POST /auth/login — correct credentials return session + refresh tokens', async () => {
    const { res, data } = await loginUser(testEmail, testPassword)

    expect(res.status).toBe(200)
    expect(data.sessionToken).toBeTruthy()
    expect(typeof data.sessionToken).toBe('string')
    expect((data.sessionToken as string).startsWith('sess_')).toBeTrue()
    expect(data.refreshToken).toBeTruthy()
    expect(typeof data.refreshToken).toBe('string')
    expect((data.refreshToken as string).startsWith('ref_')).toBeTrue()
    expect(data.expiresIn).toBe(30 * 60)
    expect((data.user as Record<string, unknown>).email).toBe(testEmail)

    sessionToken = data.sessionToken as string
    refreshToken = data.refreshToken as string
  })

  test('POST /auth/refresh — issues new token pair and rotates the old one', async () => {
    expect(refreshToken).toBeTruthy()

    const { res, data } = await authPost('/auth/refresh', { refreshToken })

    expect(res.status).toBe(200)
    expect(data.sessionToken).toBeTruthy()
    expect(typeof data.sessionToken).toBe('string')
    expect((data.sessionToken as string).startsWith('sess_')).toBeTrue()
    expect(data.refreshToken).toBeTruthy()
    expect(typeof data.refreshToken).toBe('string')
    expect((data.refreshToken as string).startsWith('ref_')).toBeTrue()
    expect(data.expiresIn).toBe(30 * 60)

    // New refresh token must differ from the old one (rotation)
    expect(data.refreshToken).not.toBe(refreshToken)

    sessionToken = data.sessionToken as string
    refreshToken = data.refreshToken as string
  })

  test('POST /auth/logout — valid session logs out successfully', async () => {
    expect(sessionToken).toBeTruthy()

    const { res, data } = await authPost(
      '/auth/logout',
      {},
      { Authorization: `Bearer ${sessionToken!}` },
    )

    expect(res.status).toBe(200)
    expect(data.message).toBeTruthy()
    expect((data.message as string).toLowerCase()).toContain('logged out')
  })

  // ═════════════════════════════════════════════════════════════════
  //  WRONG PASSWORD / NON-EXISTENT USER
  // ═════════════════════════════════════════════════════════════════

  test('POST /auth/login — wrong password returns 401', async () => {
    const { res, data } = await loginUser(testEmail, 'WrongPass999!')

    expect(res.status).toBe(401)
    expect(data.error).toBeTruthy()
    expect((data.error as string).toLowerCase()).toContain('invalid')
  })

  test('POST /auth/login — non-existent email returns 401', async () => {
    const { res, data } = await loginUser(
      `no-such-user-${Date.now()}@example.com`,
      testPassword,
    )

    expect(res.status).toBe(401)
    expect(data.error).toBeTruthy()
    expect((data.error as string).toLowerCase()).toContain('invalid')
  })

  // ═════════════════════════════════════════════════════════════════
  //  INVALID SESSION / EXPIRED TOKEN
  // ═════════════════════════════════════════════════════════════════

  test('POST /auth/logout — expired session returns 401', async () => {
    // Get a fresh session token
    const { res: loginRes, data: loginData } = await loginUser(testEmail, testPassword)
    expect(loginRes.status).toBe(200)

    const tok = loginData.sessionToken as string
    expect(tok).toBeTruthy()
    expect(tok.startsWith('sess_')).toBeTrue()

    // Directly expire the session in the database
    const hash = createHash('sha256').update(tok).digest('hex')
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 86_400_000) }) // 1 day in the past
      .where(eq(sessions.tokenHash, hash))

    // Now try to use the expired session
    const { res, data } = await authPost(
      '/auth/logout',
      {},
      { Authorization: `Bearer ${tok}` },
    )

    expect(res.status).toBe(401)
    expect((data.error as string).toLowerCase()).toContain('invalid')
    expect((data.error as string).toLowerCase()).toContain('expired')
  })

  test('POST /auth/logout — missing auth header returns 401', async () => {
    const { res, data } = await authPost('/auth/logout', {})

    expect(res.status).toBe(401)
    expect(data.error).toBeTruthy()
  })

  test('POST /auth/logout — bogus session token returns 401', async () => {
    const { res, data } = await authPost(
      '/auth/logout',
      {},
      { Authorization: 'Bearer sess_deadbeefdeadbeefdeadbeefdeadbeef' },
    )

    expect(res.status).toBe(401)
    expect((data.error as string).toLowerCase()).toContain('invalid')
  })

  // ═════════════════════════════════════════════════════════════════
  //  CONCURRENT REFRESH — THEFT DETECTION
  // ═════════════════════════════════════════════════════════════════

  test('POST /auth/refresh — reusing a rotated token triggers theft detection', async () => {
    // Get a fresh login (new session + refresh pair)
    const { res: loginRes, data: loginData } = await loginUser(testEmail, testPassword)
    expect(loginRes.status).toBe(200)

    const origRefreshToken = loginData.refreshToken as string
    expect(origRefreshToken).toBeTruthy()
    expect(origRefreshToken.startsWith('ref_')).toBeTrue()

    // First refresh — should succeed
    const { res: res1, data: data1 } = await authPost('/auth/refresh', {
      refreshToken: origRefreshToken,
    })
    expect(res1.status).toBe(200)
    expect(data1.sessionToken).toBeTruthy()
    expect(data1.refreshToken).toBeTruthy()

    // Second refresh with the SAME old token — must trigger theft detection
    // and revoke ALL sessions for this user
    const { res: res2, data: data2 } = await authPost('/auth/refresh', {
      refreshToken: origRefreshToken,
    })
    expect(res2.status).toBe(401)
    expect(data2.error).toBeTruthy()
    expect((data2.error as string).toLowerCase()).toContain('already used')
  })

  test('POST /auth/refresh — non-existent refresh token returns 401', async () => {
    const { res, data } = await authPost('/auth/refresh', {
      refreshToken: 'ref_' + 'a'.repeat(64),
    })

    expect(res.status).toBe(401)
    expect(data.error).toBeTruthy()
  })
})
