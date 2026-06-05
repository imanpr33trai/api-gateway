/**
 * Session and refresh token store for password-based auth.
 *
 * Token model:
 * - Session tokens: "sess_<64 hex chars>" — short-lived (30 min), stored SHA-256 hashed
 * - Refresh tokens: "ref_<64 hex chars>" — longer-lived (7 days), rotation model
 *
 * Refresh rotation: On /refresh, the old refresh token is marked is_used=true.
 * A new session+refresh pair is issued atomically. If a used token is replayed,
 * all user sessions are revoked (theft detection).
 */

import { and, eq } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'

import { db } from '../db'
import { refreshTokens, sessions } from '../db/schema'

// ─── Token Generation ──────────────────────────────────────────────

interface GeneratedToken {
  raw: string
  hash: string
}

function generateToken(prefix: string): GeneratedToken {
  const entropy = randomBytes(32).toString('hex')
  const raw = `${prefix}${entropy}`
  const hash = createHash('sha256').update(raw).digest('hex')
  return { raw, hash }
}

export function generateSessionToken(): GeneratedToken {
  return generateToken('sess_')
}

export function generateRefreshToken(): GeneratedToken {
  return generateToken('ref_')
}

// ─── Duration Constants ────────────────────────────────────────────

export const SESSION_DURATION_MS = 30 * 60 * 1000 // 30 minutes
export const REFRESH_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// ─── Session CRUD ──────────────────────────────────────────────────

export interface SessionRecord {
  id: number
  userId: number
  tokenHash: string
  expiresAt: Date
  lastActiveAt: Date
  createdAt: Date
}

export interface CreatedSession {
  session: SessionRecord
  rawToken: string
}

export interface CreatedSessionPair {
  session: CreatedSession
  refreshToken: GeneratedToken
}

/**
 * Create a new session + refresh token pair for the given user.
 */
export async function createSessionPair(
  userId: number
): Promise<CreatedSessionPair> {
  const sessionToken = generateSessionToken()
  const refreshToken = generateRefreshToken()
  const now = new Date()

  const [sessionRow] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: sessionToken.hash,
      expiresAt: new Date(now.getTime() + SESSION_DURATION_MS)
    })
    .returning()

  if (!sessionRow) throw new Error('Failed to create session')

  await db.insert(refreshTokens).values({
    userId,
    sessionId: sessionRow.id,
    tokenHash: refreshToken.hash,
    expiresAt: new Date(now.getTime() + REFRESH_DURATION_MS)
  })

  return {
    session: {
      session: {
        createdAt: sessionRow.createdAt,
        expiresAt: sessionRow.expiresAt,
        id: sessionRow.id,
        lastActiveAt: sessionRow.lastActiveAt,
        tokenHash: sessionRow.tokenHash,
        userId: sessionRow.userId
      },
      rawToken: sessionToken.raw
    },
    refreshToken
  }
}

/**
 * Verify a session token. Returns the session record if valid,
 * null if expired or not found. Updates lastActiveAt on access.
 */
export async function verifySession(
  rawToken: string
): Promise<SessionRecord | null> {
  const hash = createHash('sha256').update(rawToken).digest('hex')
  const now = new Date()

  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hash)))
    .limit(1)

  if (!row) return null
  if (row.expiresAt < now) {
    await db.delete(sessions).where(eq(sessions.id, row.id))
    return null
  }

  // Sliding expiry: extend session by SESSION_DURATION_MS from now
  const newExpiry = new Date(now.getTime() + SESSION_DURATION_MS)
  await db
    .update(sessions)
    .set({ lastActiveAt: now, expiresAt: newExpiry })
    .where(eq(sessions.id, row.id))

  return {
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    id: row.id,
    lastActiveAt: row.lastActiveAt,
    tokenHash: row.tokenHash,
    userId: row.userId
  }
}

/**
 * Get a session by its ID (direct DB lookup, no token verification).
 */
export async function getSessionById(
  id: number
): Promise<SessionRecord | null> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1)

  if (!row) return null
  return {
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    id: row.id,
    lastActiveAt: row.lastActiveAt,
    tokenHash: row.tokenHash,
    userId: row.userId
  }
}

/**
 * Delete a session by token (logout).
 */
export async function deleteSessionByToken(rawToken: string): Promise<boolean> {
  const hash = createHash('sha256').update(rawToken).digest('hex')
  const result = await db
    .delete(sessions)
    .where(eq(sessions.tokenHash, hash))
  return (result.rows?.length ?? 0) > 0
}

/**
 * Revoke all sessions for a user (theft detection / security event).
 */
export async function revokeAllUserSessions(userId: number): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId))
  await db
    .delete(refreshTokens)
    .where(eq(refreshTokens.userId, userId))
}

// ─── Refresh Token Rotation ────────────────────────────────────────

export interface RefreshTokenRecord {
  id: number
  userId: number
  sessionId: number | null
  tokenHash: string
  isUsed: boolean
  expiresAt: Date
  createdAt: Date
}

/**
 * Rotate a refresh token: mark old as used, issue new session+refresh pair.
 *
 * Returns the new session+refresh pair on success.
 *
 * If the old token was already used → theft detection: revoke ALL user sessions
 * and throw an error. The caller should treat this as a security event.
 */
export async function rotateRefreshToken(
  oldRawToken: string
): Promise<CreatedSessionPair> {
  const hash = createHash('sha256').update(oldRawToken).digest('hex')
  const now = new Date()

  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hash))
    .limit(1)

  if (!row) {
    throw new Error('Refresh token not found')
  }

  if (row.expiresAt < now) {
    throw new Error('Refresh token expired')
  }

  // ── Theft detection ──────────────────────────────────────────
  if (row.isUsed) {
    // A used token was replayed — revoke everything for this user
    await revokeAllUserSessions(row.userId)
    throw new Error(
      'Refresh token already used — all sessions revoked for security. Please log in again.'
    )
  }

  // Mark old refresh token as used
  await db
    .update(refreshTokens)
    .set({ isUsed: true })
    .where(eq(refreshTokens.id, row.id))

  // Issue new session + refresh pair
  return createSessionPair(row.userId)
}

/**
 * Invalidate a specific refresh token (used during logout-all or forced expiry).
 */
export async function invalidateRefreshToken(
  rawToken: string
): Promise<boolean> {
  const hash = createHash('sha256').update(rawToken).digest('hex')
  const result = await db
    .delete(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hash))
  return (result.rows?.length ?? 0) > 0
}
