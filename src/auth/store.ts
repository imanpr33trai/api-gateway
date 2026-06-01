/**
 * Credential Store — OAuth credential persistence with PostgreSQL + JSON file fallback.
 *
 * Multi-tenant: all operations are scoped by userId (default 0 = legacy single-tenant mode).
 *
 * Primary: PostgreSQL via Drizzle (user_credentials table).
 * Fallback: JSON file at ~/.config/ts-provider-oauth/credentials-{userId}.json.
 */

import { and, eq } from 'drizzle-orm'

import { db } from '../db'
import { userCredentials as credsTable } from '../db/schema'
import { logError } from '../lib/errors'
import type { OAuthAuthState } from '../types'
// ─── Helpers ─────────────────────────────────────────────────────

const ROW_FIELDS = {
  id: credsTable.id,
  userId: credsTable.userId,
  providerName: credsTable.providerName,
  portalBaseUrl: credsTable.portalBaseUrl,
  inferenceBaseUrl: credsTable.inferenceBaseUrl,
  clientId: credsTable.clientId,
  scope: credsTable.scope,
  tokenType: credsTable.tokenType,
  accessToken: credsTable.accessToken,
  refreshToken: credsTable.refreshToken,
  region: credsTable.region,
  obtainedAt: credsTable.obtainedAt,
  expiresAt: credsTable.expiresAt,
  expiresIn: credsTable.expiresIn,
  lastAuthError: credsTable.lastAuthError
}

function rowToCredential(row: Record<string, unknown>): OAuthAuthState {
  return {
    provider: row.providerName as string,
    region: (row.region as string | null) ?? undefined,
    portalBaseUrl: row.portalBaseUrl as string,
    inferenceBaseUrl: row.inferenceBaseUrl as string,
    clientId: row.clientId as string,
    scope: row.scope as string,
    tokenType: row.tokenType as string,
    accessToken: row.accessToken as string,
    refreshToken: (row.refreshToken as string | null) ?? undefined,
    obtainedAt:
      (row.obtainedAt as Date | undefined)?.toISOString?.() ??
      new Date().toISOString(),
    expiresAt: (row.expiresAt as Date | undefined)?.toISOString?.(),
    expiresIn: row.expiresIn as number,
    lastAuthError:
      row.lastAuthError as unknown as OAuthAuthState['lastAuthError']
  }
}

function buildValues(state: OAuthAuthState) {
  return {
    providerName: state.provider,
    region: state.region ?? 'global',
    portalBaseUrl: state.portalBaseUrl,
    inferenceBaseUrl: state.inferenceBaseUrl,
    clientId: state.clientId,
    scope: state.scope,
    tokenType: state.tokenType,
    accessToken: state.accessToken,
    refreshToken: state.refreshToken ?? null,
    obtainedAt: new Date(state.obtainedAt),
    expiresAt: state.expiresAt ? new Date(state.expiresAt) : null,
    expiresIn: state.expiresIn,
    lastAuthError: state.lastAuthError ?? null
  }
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Get stored OAuth credentials.
 * @param providerName - provider identifier
 * @param userId - user ID (default 0 = legacy single-tenant mode)
 */
export async function getCredentials(
  providerName: string,
  userId: number = 0
): Promise<OAuthAuthState | null> {
  try {
    const rows = await db
      .select(ROW_FIELDS)
      .from(credsTable)
      .where(
        and(
          eq(credsTable.userId, userId),
          eq(credsTable.providerName, providerName)
        )
      )
      .limit(1)

    if (Array.isArray(rows) && rows.length > 0) {
      return rowToCredential(rows[0]!)
    }
  } catch (err) {
    logError('getCredentials: DB query failed', err, {
      provider: providerName,
      userId
    })
  }

  return null
}

/**
 * Save OAuth credentials (upsert).
 * @param providerName - provider identifier
 * @param state - credential state to save
 * @param userId - user ID (default 0 = legacy single-tenant mode)
 */
export async function saveCredentials(
  _providerName: string,
  state: OAuthAuthState,
  userId: number = 0
): Promise<void> {
  const values = buildValues(state)

  try {
    const existing = await db
      .select({ id: credsTable.id })
      .from(credsTable)
      .where(
        and(
          eq(credsTable.userId, userId),
          eq(credsTable.providerName, state.provider)
        )
      )
      .limit(1)

    if (Array.isArray(existing) && existing.length > 0) {
      await db
        .update(credsTable)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(credsTable.id, existing[0]!.id))
    } else {
      await db.insert(credsTable).values({ ...values, userId })
    }
    return
  } catch (err) {
    logError('saveCredentials: DB query failed', err, {
      provider: state.provider,
      userId
    })
  }

  throw new Error(
    `DB unavailable: cannot save credentials for ${state.provider} (userId=${userId})`
  )
}

/**
 * Clear OAuth credentials.
 * @param providerName - provider identifier
 * @param userId - user ID (default 0 = legacy single-tenant mode)
 * @param errorInfo - optional error info to store (quarantine)
 */
export async function clearCredentials(
  providerName: string,
  userId: number = 0,
  errorInfo?: {
    provider: string
    code: string
    message: string
    reason: string
    reloginRequired: boolean
    at: string
  }
): Promise<void> {
  try {
    await db
      .update(credsTable)
      .set({
        accessToken: '',
        refreshToken: null,
        expiresAt: null,
        expiresIn: 0,
        lastAuthError: errorInfo ?? null,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(credsTable.userId, userId),
          eq(credsTable.providerName, providerName)
        )
      )
  } catch (err) {
    logError('clearCredentials: DB update failed', err, {
      provider: providerName,
      userId
    })
  }
}

/**
 * List all providers a user has credentials for.
 */
export async function listCredentialProviders(
  userId: number = 0
): Promise<string[]> {
  try {
    const rows = await db
      .select({ providerName: credsTable.providerName })
      .from(credsTable)
      .where(eq(credsTable.userId, userId))

    if (Array.isArray(rows)) {
      return rows.map(r => r.providerName)
    }
  } catch (err) {
    logError('listCredentialProviders: DB query failed', err, {
      userId
    })
  }

  return []
}

// ─── Utility Functions ───────────────────────────────────────────

export function isExpiring(
  expiresAtISO: string | undefined | null,
  skewSeconds: number
): boolean {
  if (!expiresAtISO) return true
  const epoch = new Date(expiresAtISO).getTime() / 1000
  if (isNaN(epoch)) return true
  return epoch <= Date.now() / 1000 + skewSeconds
}

export function resolveTokenExpiryUnix(expiredIn: number): number {
  const nowMs = Date.now()
  const raw = Math.floor(expiredIn)
  if (raw > nowMs / 2) {
    return raw / 1000
  }
  return raw
}
