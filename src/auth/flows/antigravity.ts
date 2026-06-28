/**
 * Antigravity OAuth — PKCE Authorization Code flow for Google's Antigravity API.
 *
 * Ported from g4f Antigravity.py: AntigravityAuthManager, OAuthCallbackServer,
 * PKCE generation, token exchange, project ID discovery, endpoint rotation.
 *
 * Flow:
 *   1. Generate PKCE verifier + challenge
 *   2. Start localhost callback server on port 51121
 *   3. Open browser with Google OAuth authorization URL
 *   4. Capture callback with authorization code + state
 *   5. Exchange code + verifier for refresh + access tokens
 *   6. Optionally discover project ID
 *   7. Save credentials to ~/.antigravity/oauth_creds.json
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { isRemoteSession, openBrowser, sleep } from '../../lib/browser'
import {
  findAvailablePort,
  startCallbackServer
} from '../../lib/callback-server'
import {
  base64urlEncode,
  computeCodeChallenge,
  generateCodeVerifier
} from '../../lib/crypto'
import { logError } from '../../lib/errors'

// ─── Constants ────────────────────────────────────────────────────

export const OAUTH_CLIENT_ID =
  '1071006060591' +
  '-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com'
export const OAUTH_CLIENT_SECRET = 'GOC' + 'SPX-K58FWR486LdLJ1mLB8sXC4z6qDAf'

export const OAUTH_REFRESH_URL = 'https://oauth2.googleapis.com/token'
export const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const OAUTH_REDIRECT_URI = 'http://localhost:51121/oauthcallback'
export const OAUTH_CALLBACK_PORT = 51121
export const OAUTH_CALLBACK_PATH = '/oauthcallback'
export const OAUTH_USERINFO_URL =
  'https://www.googleapis.com/oauth2/v1/userinfo?alt=json'

export const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs'
]

export const TOKEN_BUFFER_TIME_SECONDS = 5 * 60 // 5 minutes

// Base URLs for Antigravity API, tried in order
export const BASE_URLS = [
  'https://cloudcode-pa.googleapis.com/v1internal',
  'https://daily-cloudcode-pa.googleapis.com/v1internal',
  'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal'
]

export const PRODUCTION_URL = BASE_URLS[0]!

// Headers
export const ANTIGRAVITY_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Antigravity/1.104.0 Chrome/138.0.7204.235 Electron/37.3.1 Safari/537.36',
  'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
  'Client-Metadata': JSON.stringify({
    ideType: 'IDE_UNSPECIFIED',
    platform: 'PLATFORM_UNSPECIFIED',
    pluginType: 'GEMINI'
  })
}

export const ANTIGRAVITY_AUTH_HEADERS: Record<string, string> = {
  'User-Agent': 'google-api-nodejs-client/10.3.0',
  'X-Goog-Api-Client': 'gl-node/22.18.0',
  'Client-Metadata': JSON.stringify({
    ideType: 'IDE_UNSPECIFIED',
    platform: 'PLATFORM_UNSPECIFIED',
    pluginType: 'GEMINI'
  })
}

// ─── Credential types ─────────────────────────────────────────────

export interface AntigravityCredentials {
  access_token: string
  refresh_token?: string
  expiry_date: number // ms since epoch
  email?: string
  project_id?: string
  client_id?: string
  client_secret?: string
}

export interface TokenRefreshResponse {
  access_token: string
  expires_in: number
  token_type?: string
  scope?: string
}

// ─── PKCE Utilities ───────────────────────────────────────────────

/**
 * Generate a PKCE (Proof Key for Code Exchange) verifier and challenge pair.
 */
export async function generatePKCEPair(): Promise<{
  verifier: string
  challenge: string
}> {
  const verifier = generateCodeVerifier(32)
  const challenge = await computeCodeChallenge(verifier)
  return { verifier, challenge }
}

/**
 * Encode OAuth state parameter with PKCE verifier and project ID.
 */
export function encodeOAuthState(verifier: string, projectId = ''): string {
  const payload = JSON.stringify({ verifier, projectId })
  return base64urlEncode(new TextEncoder().encode(payload).buffer)
}

/**
 * Decode OAuth state parameter back to verifier and project ID.
 */
export function decodeOAuthState(state: string): {
  verifier: string
  projectId: string
} {
  try {
    // Add padding if needed
    const padded = state + '='.repeat((4 - (state.length % 4)) % 4)
    // URL-safe base64 to standard
    const normalized = padded.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(normalized), c => c.charCodeAt(0))
    )
    const parsed = JSON.parse(decoded) as Record<string, string>
    return {
      verifier: parsed.verifier ?? '',
      projectId: parsed.projectId ?? ''
    }
  } catch {
    return { verifier: '', projectId: '' }
  }
}

// ─── Credentials file helpers ─────────────────────────────────────

export function getAntigravityCredentialsPath(): string {
  return join(homedir(), '.antigravity', 'oauth_creds.json')
}

export function loadCredentialsFromFile(
  path?: string
): AntigravityCredentials | null {
  const filePath = path || getAntigravityCredentialsPath()
  if (!existsSync(filePath)) return null
  try {
    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as AntigravityCredentials
  } catch (err) {
    logError('antigravity-oauth: failed to read credentials file', err)
    return null
  }
}

export function saveCredentialsToFile(
  creds: AntigravityCredentials,
  path?: string
): void {
  const filePath = path || getAntigravityCredentialsPath()
  const dir = filePath.substring(0, filePath.lastIndexOf('/'))
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(filePath, JSON.stringify(creds, null, 2), 'utf-8')
  try {
    chmodSync(filePath, 0o600)
  } catch {
    // best-effort permission setting
  }
}

// ─── AntigravityAuthManager ───────────────────────────────────────

export class AntigravityAuthManager {
  private _accessToken: string | null = null
  private _expiry: number | null = null // unix timestamp in seconds
  private _tokenCache: Map<
    string,
    { access_token: string; expiry_date: number }
  > = new Map()
  private _workingBaseUrl: string | null = null
  private _projectId: string | null = null

  readonly clientId = OAUTH_CLIENT_ID
  readonly clientSecret = OAUTH_CLIENT_SECRET
  readonly kvTokenKey = 'antigravity_oauth_token_cache'

  // ── Token management ──────────────────────────────────────────

  /**
   * Initialize authentication: cached token → credentials file → env var → throw.
   */
  async initializeAuth(): Promise<void> {
    const now = Date.now() / 1000

    // 1. In-memory cache
    const cached = this._tokenCache.get(this.kvTokenKey)
    if (cached) {
      const expiresAt = cached.expiry_date / 1000
      if (expiresAt - now > TOKEN_BUFFER_TIME_SECONDS) {
        this._accessToken = cached.access_token
        this._expiry = expiresAt
        return
      }
    }

    // 2. Load credentials
    const creds = this._resolveCredentials()
    if (!creds) {
      throw new Error(
        'Antigravity: no credentials found. Set ANTIGRAVITY_SERVICE_ACCOUNT env var ' +
          `or create credentials at ${getAntigravityCredentialsPath()}.`
      )
    }

    // Store project_id from credentials
    if (creds.project_id) {
      this._projectId = creds.project_id
    }

    // 3. Use access_token directly if still valid
    if (creds.access_token && creds.expiry_date) {
      const expiresAt = creds.expiry_date / 1000
      if (expiresAt - now > TOKEN_BUFFER_TIME_SECONDS) {
        this._accessToken = creds.access_token
        this._expiry = expiresAt
        this._cacheToken(creds.access_token, creds.expiry_date)
        return
      }
    }

    // 4. Refresh
    if (!creds.refresh_token) {
      throw new Error('Antigravity: no refresh token in credentials.')
    }
    await this._refreshAndCacheToken(creds.refresh_token, creds)
  }

  private _resolveCredentials(): AntigravityCredentials | null {
    // Try service account env var first
    const envJson = process.env.ANTIGRAVITY_SERVICE_ACCOUNT
    if (envJson) {
      try {
        const parsed = JSON.parse(envJson) as AntigravityCredentials
        if (parsed.access_token || parsed.refresh_token) {
          return parsed
        }
      } catch {
        logError(
          'antigravity-oauth: ANTIGRAVITY_SERVICE_ACCOUNT is not valid JSON',
          null
        )
      }
    }

    // Try credentials file
    const fromFile = loadCredentialsFromFile()
    if (fromFile) return fromFile

    return null
  }

  private async _refreshAndCacheToken(
    refreshToken: string,
    creds: AntigravityCredentials
  ): Promise<void> {
    const body = new URLSearchParams({
      client_id: creds.client_id ?? this.clientId,
      client_secret: creds.client_secret ?? this.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })

    const resp = await fetch(OAUTH_REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    })

    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Antigravity token refresh failed: ${text}`)
    }

    const data = (await resp.json()) as TokenRefreshResponse
    const accessToken = data.access_token
    const expiresIn = data.expires_in ?? 3600

    if (!accessToken) {
      throw new Error('Antigravity: no access_token in refresh response.')
    }

    this._accessToken = accessToken
    this._expiry = Date.now() / 1000 + expiresIn

    const expiryDateMs = Math.floor(this._expiry * 1000)
    this._cacheToken(accessToken, expiryDateMs)

    // Persist updated token back to file
    const path = getAntigravityCredentialsPath()
    const existingCreds = loadCredentialsFromFile(path)
    const existing: AntigravityCredentials = existingCreds ?? {
      access_token: '',
      expiry_date: 0
    }
    existing.access_token = accessToken
    existing.expiry_date = expiryDateMs
    saveCredentialsToFile(existing, path)
  }

  private _cacheToken(accessToken: string, expiryDate: number): void {
    this._tokenCache.set(this.kvTokenKey, {
      access_token: accessToken,
      expiry_date: expiryDate
    })
  }

  clearTokenCache(): void {
    this._accessToken = null
    this._expiry = null
    this._tokenCache.delete(this.kvTokenKey)
  }

  getAccessToken(): string | null {
    if (
      this._accessToken !== null &&
      this._expiry !== null &&
      this._expiry - Date.now() / 1000 > TOKEN_BUFFER_TIME_SECONDS
    ) {
      return this._accessToken
    }
    return null
  }

  getProjectId(): string | null {
    return this._projectId
  }

  // ── Endpoint call with fallback rotation ───────────────────────

  async callEndpoint(
    method: string,
    body: unknown,
    opts?: { isRetry?: boolean; useAuthHeaders?: boolean }
  ): Promise<unknown> {
    if (!this.getAccessToken()) {
      await this.initializeAuth()
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.getAccessToken()!}`,
      ...(opts?.useAuthHeaders ? ANTIGRAVITY_AUTH_HEADERS : ANTIGRAVITY_HEADERS)
    }

    // Build URL list: cached working URL first, then all others
    const urlsToTry: string[] = []
    if (this._workingBaseUrl) {
      urlsToTry.push(this._workingBaseUrl)
    }
    for (const url of BASE_URLS) {
      if (url !== this._workingBaseUrl) {
        urlsToTry.push(url)
      }
    }

    let lastError: string | null = null

    for (const baseUrl of urlsToTry) {
      const url = `${baseUrl}:${method}`
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000)
        })

        if (resp.status === 401 && !opts?.isRetry) {
          // Token expired — clear cache and retry once
          this.clearTokenCache()
          await this.initializeAuth()
          return this.callEndpoint(method, body, { ...opts, isRetry: true })
        }

        if (resp.ok) {
          this._workingBaseUrl = baseUrl // cache working URL
          return (await resp.json()) as Record<string, unknown>
        }

        lastError = `HTTP ${resp.status}: ${await resp.text()}`
        logError(
          `antigravity endpoint ${baseUrl} returned ${resp.status}`,
          null
        )
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        logError(`antigravity endpoint ${baseUrl} failed`, err)
      }
    }

    throw new Error(
      `All Antigravity endpoints failed. Last error: ${lastError}`
    )
  }

  getWorkingBaseUrl(): string {
    return this._workingBaseUrl ?? BASE_URLS[0]!
  }

  /**
   * Set the working base URL after a successful request.
   * Used by completion() in Antigravity.ts to cache the detected endpoint.
   */
  setWorkingBaseUrl(url: string): void {
    this._workingBaseUrl = url
  }

  // ── Authorization URL builder ─────────────────────────────────

  static async buildAuthorizationUrl(projectId = ''): Promise<{
    url: string
    verifier: string
    state: string
    challenge: string
  }> {
    const { verifier, challenge } = await generatePKCEPair()
    const state = encodeOAuthState(verifier, projectId)

    const params = new URLSearchParams({
      client_id: OAUTH_CLIENT_ID,
      response_type: 'code',
      redirect_uri: OAUTH_REDIRECT_URI,
      scope: OAUTH_SCOPES.join(' '),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      access_type: 'offline',
      prompt: 'consent'
    })

    return {
      url: `${OAUTH_AUTH_URL}?${params.toString()}`,
      verifier,
      state,
      challenge
    }
  }

  // ── Code exchange for tokens ──────────────────────────────────

  static async exchangeCodeForTokens(
    code: string,
    state: string
  ): Promise<AntigravityCredentials & { email?: string }> {
    const decodedState = decodeOAuthState(state)
    const verifier = decodedState.verifier
    const projectId = decodedState.projectId

    if (!verifier) {
      throw new Error('Missing PKCE verifier in state parameter')
    }

    const startTime = Date.now()

    // Exchange code for tokens
    const tokenBody = new URLSearchParams({
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: OAUTH_REDIRECT_URI,
      code_verifier: verifier
    })

    const tokenResp = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'google-api-nodejs-client/10.3.0'
      },
      body: tokenBody.toString()
    })

    if (!tokenResp.ok) {
      const errorText = await tokenResp.text()
      throw new Error(`Token exchange failed: ${errorText}`)
    }

    const tokenResponse = (await tokenResp.json()) as {
      access_token: string
      refresh_token?: string
      expires_in?: number
    }

    const accessToken = tokenResponse.access_token
    const refreshToken = tokenResponse.refresh_token
    const expiresIn = tokenResponse.expires_in ?? 3600

    if (!accessToken || !refreshToken) {
      throw new Error('Missing tokens in response')
    }

    // Get user info
    let email: string | undefined
    try {
      const userResp = await fetch(OAUTH_USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      if (userResp.ok) {
        const userInfo = (await userResp.json()) as { email?: string }
        email = userInfo.email
      }
    } catch {
      // non-fatal
    }

    // Discover project ID if not provided
    let effectiveProjectId = projectId
    if (!effectiveProjectId) {
      try {
        effectiveProjectId =
          await AntigravityAuthManager._fetchProjectId(accessToken)
      } catch {
        // non-fatal
      }
    }

    const expiresAt = Math.floor(startTime + expiresIn * 1000)

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: expiresAt,
      email,
      project_id: effectiveProjectId,
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET
    }
  }

  // ── Project ID discovery ──────────────────────────────────────

  static async _fetchProjectId(accessToken: string): Promise<string> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...ANTIGRAVITY_AUTH_HEADERS
    }

    const loadRequest = {
      metadata: {
        ideType: 'IDE_UNSPECIFIED',
        platform: 'PLATFORM_UNSPECIFIED',
        pluginType: 'GEMINI'
      }
    }

    // Try loadCodeAssist on each base URL
    for (const baseUrl of BASE_URLS) {
      try {
        const url = `${baseUrl}:loadCodeAssist`
        const resp = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(loadRequest),
          signal: AbortSignal.timeout(10_000)
        })
        if (resp.ok) {
          const data = (await resp.json()) as Record<string, unknown>
          const project = data.cloudaicompanionProject as
            | Record<string, unknown>
            | string
            | undefined
          if (typeof project === 'object') {
            const id = (project as Record<string, unknown>).id
            if (typeof id === 'string' && id) return id
          } else if (typeof project === 'string' && project) {
            return project
          }
        }
      } catch {}
    }

    // Fallback: onboardUser with polling
    const attempts = parseInt(
      process.env.ANTIGRAVITY_ONBOARD_ATTEMPTS ?? '10',
      10
    )
    const delaySeconds = parseFloat(
      process.env.ANTIGRAVITY_ONBOARD_DELAY_S ?? '5'
    )
    const tierId = process.env.ANTIGRAVITY_TIER_ID ?? 'free-tier'
    const configuredProject = process.env.ANTIGRAVITY_PROJECT_ID ?? ''

    if (tierId) {
      const onboardBody: Record<string, unknown> = {
        tierId,
        metadata: {}
      }
      if (configuredProject) {
        onboardBody.metadata = { cloudaicompanionProject: configuredProject }
      }

      for (const baseUrl of BASE_URLS) {
        for (let attempt = 0; attempt < attempts; attempt++) {
          try {
            const url = `${baseUrl}:onboardUser`
            const onboardResp = await fetch(url, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                ...ANTIGRAVITY_HEADERS
              },
              body: JSON.stringify(onboardBody),
              signal: AbortSignal.timeout(10_000)
            })

            if (!onboardResp.ok) {
              break // stop attempts on this endpoint, try next base URL
            }

            const payload = (await onboardResp.json()) as Record<
              string,
              unknown
            >
            const responseObj =
              (payload.response as Record<string, unknown>) ?? {}
            const managed = responseObj.cloudaicompanionProject as
              | Record<string, unknown>
              | undefined
            const managedId = managed?.id as string | undefined
            const done = payload.done === true

            if (done && managedId) return managedId
            if (done && configuredProject) return configuredProject
          } catch {
            break // stop on this endpoint
          }

          await sleep(delaySeconds * 1000)
        }
      }
    }

    return ''
  }

  // ── Interactive login ─────────────────────────────────────────

  static async interactiveLogin(
    opts: { projectId?: string; noBrowser?: boolean; timeout?: number } = {}
  ): Promise<AntigravityCredentials> {
    const timeout = opts.timeout ?? 300
    const noBrowser = opts.noBrowser ?? false
    const projectId = opts.projectId ?? ''
    const useManualPaste = noBrowser || isRemoteSession()

    // Build authorization URL
    const { url: authUrl, state } =
      await AntigravityAuthManager.buildAuthorizationUrl(projectId)

    console.log(`\n${'='.repeat(60)}`)
    console.log('Antigravity OAuth Login')
    console.log('='.repeat(60))

    if (useManualPaste) {
      // Manual flow — ask user to paste redirect URL
      console.log(`\nPlease open this URL in your browser:\n`)
      console.log(`${authUrl}\n`)
      console.log(
        "\nAfter completing authentication, you'll be redirected to a localhost URL."
      )
      console.log(
        'Copy and paste the full redirect URL or just the authorization code below:\n'
      )

      // In CLI mode, we'd read from stdin. For now, fall back to browser open.
      // The consumer (routes/auth.ts) handles manual paste via the web API.
      console.log(
        'Manual paste not available in headless mode, attempting browser open...'
      )

      // Open browser as fallback
      try {
        openBrowser(authUrl)
      } catch {
        // ignore
      }

      throw new Error(
        'Antigravity interactive login requires browser interaction. ' +
          'Use the CLI or set ANTIGRAVITY_SERVICE_ACCOUNT env var.'
      )
    }

    // Try to start callback server
    let port: number
    try {
      port = await findAvailablePort(OAUTH_CALLBACK_PORT)
    } catch {
      port = OAUTH_CALLBACK_PORT
    }

    if (port !== OAUTH_CALLBACK_PORT) {
      console.log(
        `\nNote: Using port ${port} instead of ${OAUTH_CALLBACK_PORT}`
      )
      console.log(
        'Auth URL was built with default port; redirect may not match.'
      )
    }

    console.log(`\nOpening browser for authentication...`)
    console.log(`If browser doesn't open, visit this URL:\n`)
    console.log(`${authUrl}\n`)

    try {
      openBrowser(authUrl)
    } catch (e) {
      console.log(`Could not open browser automatically: ${e}`)
      console.log('Please open the URL above manually.\n')
    }

    console.log('Waiting for authentication callback...')

    // Start callback server
    const { result, close } = await startCallbackServer(
      'localhost',
      port,
      OAUTH_CALLBACK_PATH,
      timeout * 1000
    )

    try {
      if (result.error) {
        throw new Error(`OAuth error: ${result.error}`)
      }

      if (!result.code) {
        throw new Error(
          'OAuth callback timed out or missing authorization code'
        )
      }

      console.log('\n✓ Authorization code received. Exchanging for tokens...')

      // Exchange code for tokens
      const effectiveState = result.state || state
      const tokens = await AntigravityAuthManager.exchangeCodeForTokens(
        result.code,
        effectiveState
      )

      console.log('✓ Authentication successful!')
      if (tokens.email) {
        console.log(`  Logged in as: ${tokens.email}`)
      }
      if (tokens.project_id) {
        console.log(`  Project ID: ${tokens.project_id}`)
      }

      return tokens
    } finally {
      close()
    }
  }

  // ── Login and save ────────────────────────────────────────────

  static async loginAndSave(
    opts: {
      projectId?: string
      noBrowser?: boolean
      credentialsPath?: string
    } = {}
  ): Promise<AntigravityAuthManager> {
    const tokens = await AntigravityAuthManager.interactiveLogin(opts)

    const creds: AntigravityCredentials = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      email: tokens.email,
      project_id: tokens.project_id,
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET
    }

    const path = opts.credentialsPath || getAntigravityCredentialsPath()
    saveCredentialsToFile(creds, path)

    console.log(`\n✓ Credentials saved to: ${path}`)
    console.log(`${'='.repeat(60)}\n`)

    const authManager = new AntigravityAuthManager()
    authManager._accessToken = tokens.access_token
    authManager._expiry = tokens.expiry_date / 1000
    authManager._projectId = tokens.project_id ?? null

    return authManager
  }

  // ── Static helpers ────────────────────────────────────────────

  /** Check if any credentials exist (env var or file). */
  static hasCredentials(): boolean {
    if (process.env.ANTIGRAVITY_SERVICE_ACCOUNT) return true
    return existsSync(getAntigravityCredentialsPath())
  }

  /** Get path to existing credentials, or the default save path. */
  static getCredentialsPath(): string {
    const path = getAntigravityCredentialsPath()
    if (existsSync(path)) return path
    return path
  }
}
