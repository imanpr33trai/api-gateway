/**
 * Login Session Store — in-memory multi-phase OAuth login sessions.
 *
 * For web frontends that need to display user_code and verification_uri
 * to the user during the OAuth flow, instead of blocking until completion.
 *
 * Supported flow types:
 *   - user_code  (MiniMax): PKCE + user code grant
 *   - device_code (Nous):   RFC 8628 Device Authorization Grant
 *
 * Unsupported for two-phase (returns descriptive error):
 *   - authorization_code (xAI): needs localhost callback server
 *   - external_process (Codex/Qwen): launches subprocesses
 *
 * Flow:
 *   1. POST /api/auth/login/start → returns { sessionId, userCode, ... }
 *   2. Frontend displays code, user approves in browser
 *   3. Frontend polls GET /api/auth/login/status/:id
 *   4. Background poller completes the token exchange
 *
 * Sessions expire after 15 minutes regardless of completion.
 */

import type { OAuthAuthState } from '../types'
// import { DeviceCodeOAuthProvider } from './flows/device-code'
// import { MiniMaxOAuthProvider } from './flows/user-code'
import { saveCredentials } from './store'

// ─── Types ───────────────────────────────────────────────────────

export type LoginSessionStatus = 'pending' | 'polling' | 'success' | 'error'

export type OAuthFlowType = 'user_code' | 'device_code'

export interface LoginStartResult {
  sessionId: string
  userCode: string
  verificationUri: string
  verificationUrl: string
  intervalMs: number
}

interface StoredSession {
  provider: string
  region: string
  userId: number
  status: LoginSessionStatus
  flowType: OAuthFlowType
  userCode: string
  verificationUri: string
  verificationUrl: string
  intervalMs: number
  /** PKCE verifier (user_code) or device_code (device_code) */
  secret: string
  portalBaseUrl: string
  expiredIn: number
  createdAt: number
  expiresAt: number
  authState?: OAuthAuthState
  error?: string
}

// ─── Store ────────────────────────────────────────────────────────

const SESSION_TTL_MS = 15 * 60 * 1000 // 15 minutes
const CLEANUP_INTERVAL_MS = 60_000 // every 60s

const sessions = new Map<string, StoredSession>()

// Periodic cleanup of expired sessions
let cleanupTimer: ReturnType<typeof setInterval> | null = null
function ensureCleanup() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [id, s] of sessions) {
      if (now > s.expiresAt) sessions.delete(id)
    }
    if (sessions.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer)
      cleanupTimer = null
    }
  }, CLEANUP_INTERVAL_MS)
}

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  for (let i = 0; i < 24; i++) {
    result += chars[bytes[i]! % chars.length]
  }
  return result
}

// ─── Supported providers ─────────────────────────────────────────

interface ProviderHandler {
  flowType: OAuthFlowType
  getPortalBase(region: string): string
  getInferenceBase(region: string): string
  start(portalBaseUrl: string): Promise<{
    userCode: string
    verificationUri: string
    verificationUrl: string
    intervalMs: number
    expiredIn: number
    secret: string // PKCE verifier or device_code
  }>
  poll(
    portalBaseUrl: string,
    secret: string,
    userCode: string,
    expiredIn: number,
    intervalMs: number
  ): Promise<OAuthAuthState>
}

function getProviderHandler(providerName: string): ProviderHandler {
  switch (providerName) {
    case 'minimax-oauth':
      return minimaxHandler
    case 'nous':
      return nousHandler
    case 'xai-oauth':
      throw new Error(
        `'${providerName}' uses PKCE authorization_code with a localhost callback server. ` +
          "This flow isn't supported via the web API. Use the CLI: bun run src/auth/oauth.ts"
      )
    case 'openai-codex':
    case 'qwen-oauth':
    case 'gemini-cli':
      throw new Error(
        `'${providerName}' uses an external process flow that isn't supported via the web API. ` +
          'Use the CLI: bun run src/auth/oauth.ts'
      )
    default:
      throw new Error(
        `No two-phase login available for '${providerName}'. ` +
          'Use the CLI: bun run src/auth/oauth.ts'
      )
  }
}

// ─── MiniMax handler (user_code) ─────────────────────────────────

const minimaxHandler: ProviderHandler = {
  flowType: 'user_code',
  getPortalBase(region: string) {
    const oauth = new MiniMaxOAuthProvider()
    return oauth.getPortalBase(region)
  },
  getInferenceBase(region: string) {
    const oauth = new MiniMaxOAuthProvider()
    return oauth.getInferenceBase(region)
  },
  async start(portalBaseUrl: string) {
    const oauth = new MiniMaxOAuthProvider()
    const { codeVerifier, codeChallenge, state } = await oauth.generatePKCE()
    const cd = await oauth.requestUserCode(portalBaseUrl, codeChallenge, state)
    return {
      userCode: cd.userCode,
      verificationUri: cd.verificationUri,
      verificationUrl: cd.verificationUrl,
      intervalMs: cd.intervalMs,
      expiredIn: cd.expiredIn,
      secret: codeVerifier
    }
  },
  async poll(
    portalBaseUrl: string,
    codeVerifier: string,
    userCode: string,
    expiredIn: number,
    intervalMs: number
  ) {
    const oauth = new MiniMaxOAuthProvider()
    const tokenData = await oauth.pollToken(
      portalBaseUrl,
      oauth.clientId,
      userCode,
      codeVerifier,
      expiredIn,
      intervalMs
    )
    // Infer region from portalUrl for minimax
    const region = portalBaseUrl.includes('minimaxi.com') ? 'cn' : 'global'
    const infBase = oauth.getInferenceBase(region)
    return oauth.buildAuthState(tokenData, region, portalBaseUrl, infBase)
  }
}

// ─── Nous handler (device_code) ──────────────────────────────────

const nousHandler: ProviderHandler = {
  flowType: 'device_code',
  getPortalBase(_region: string) {
    // Nous is global-only, no regional split
    return 'https://portal.nousresearch.com'
  },
  getInferenceBase(_region: string) {
    return 'https://inference-api.nousresearch.com/v1'
  },
  async start(portalBaseUrl: string) {
    const oauth = new DeviceCodeOAuthProvider()
    const cd = await oauth.requestDeviceCode(portalBaseUrl)
    return {
      userCode: cd.userCode,
      verificationUri: cd.verificationUri,
      verificationUrl: cd.verificationUrl,
      intervalMs: cd.interval * 1000,
      expiredIn: cd.expiresIn,
      secret: cd.deviceCode
    }
  },
  async poll(
    portalBaseUrl: string,
    deviceCode: string,
    _userCode: string,
    expiredIn: number,
    intervalMs: number
  ) {
    const oauth = new DeviceCodeOAuthProvider()
    const tokenResponse = await oauth.pollToken(
      portalBaseUrl,
      deviceCode,
      expiredIn,
      intervalMs
    )
    return oauth.buildAuthState(tokenResponse)
  }
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Start an OAuth login session for any supported provider.
 * Returns intermediate data for the frontend to display.
 */
export async function startLogin(
  provider: string,
  region: string,
  userId: number
): Promise<LoginStartResult> {
  ensureCleanup()

  const handler = getProviderHandler(provider)
  const portalBaseUrl = handler.getPortalBase(region)
  const startData = await handler.start(portalBaseUrl)

  const id = generateId()
  const now = Date.now()

  const stored: StoredSession = {
    provider,
    region,
    userId,
    status: 'pending',
    flowType: handler.flowType,
    userCode: startData.userCode,
    verificationUri: startData.verificationUri,
    verificationUrl: startData.verificationUrl,
    intervalMs: startData.intervalMs,
    secret: startData.secret,
    portalBaseUrl,
    expiredIn: startData.expiredIn,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS
  }

  sessions.set(id, stored)

  // Kick off background polling
  pollInBackground(id, stored)

  return {
    sessionId: id,
    userCode: startData.userCode,
    verificationUri: startData.verificationUri,
    verificationUrl: startData.verificationUrl,
    intervalMs: startData.intervalMs
  }
}

/**
 * Get the status of a login session.
 */
export function getLoginStatus(sessionId: string): {
  status: LoginSessionStatus
  authState?: OAuthAuthState
  error?: string
} | null {
  const s = sessions.get(sessionId)
  if (!s) return null

  return {
    status: s.status,
    authState: s.status === 'success' ? s.authState : undefined,
    error: s.status === 'error' ? s.error : undefined
  }
}

// ─── Background Polling ───────────────────────────────────────────

async function pollInBackground(id: string, session: StoredSession) {
  try {
    const s = sessions.get(id)
    if (!s) return
    s.status = 'polling'

    const handler = getProviderHandler(session.provider)

    const authState = await handler.poll(
      session.portalBaseUrl,
      session.secret,
      session.userCode,
      session.expiredIn,
      session.intervalMs
    )

    // Save to DB
    await saveCredentials(session.provider, authState, session.userId)

    // Mark success
    const updated = sessions.get(id)
    if (updated) {
      updated.status = 'success'
      updated.authState = authState
    }
  } catch (err) {
    const updated = sessions.get(id)
    if (updated) {
      updated.status = 'error'
      updated.error = err instanceof Error ? err.message : 'Unknown error'
    }
  }
}
