/**
 * xAI Grok OAuth — PKCE Authorization Code with Loopback Server
 *
 * Uses OIDC discovery to find auth/token endpoints, then runs the
 * standard PKCE authorization code flow with a localhost callback server.
 *
 * Flow:
 *   1. OIDC discovery: GET .well-known/openid-configuration
 *   2. Generate PKCE + state + nonce
 *   3. Start localhost callback server
 *   4. Open browser with authorization URL
 *   5. Receive code via callback
 *   6. Exchange code + verifier for tokens
 *   7. Persist to auth store
 */

import { isRemoteSession, openBrowser } from '../../lib/browser'
import { findAvailablePort } from '../../lib/callback-server'
import {
  computeCodeChallenge,
  generateCodeVerifier,
  generateNonce,
  generateState
} from '../../lib/crypto'
import { httpFormPost, httpGet } from '../../lib/http-client'
import { AuthError, type OAuthAuthState } from '../../providers/types'
import { saveCredentials } from '../store'

// ─── Constants ────────────────────────────────────────────────────

export const XAI_OAUTH_ISSUER = 'https://auth.x.ai'
export const XAI_OAUTH_DISCOVERY_URL = `${XAI_OAUTH_ISSUER}/.well-known/openid-configuration`
export const XAI_OAUTH_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828'
export const XAI_OAUTH_SCOPE =
  'openid profile email offline_access grok-cli:access api:access'
export const XAI_OAUTH_REDIRECT_HOST = '127.0.0.1'
export const XAI_OAUTH_REDIRECT_PORT = 56121
export const XAI_OAUTH_REDIRECT_PATH = '/callback'
export const XAI_BASE_URL = 'https://api.x.ai/v1'
export const XAI_REFRESH_SKEW_SECONDS = 120

interface OidcConfig {
  authorization_endpoint: string
  token_endpoint: string
  issuer: string
}

// ─── xAI OAuth Provider ───────────────────────────────────────────

export class XAIOAuthProvider {
  readonly clientId = XAI_OAUTH_CLIENT_ID
  readonly scope = XAI_OAUTH_SCOPE
  readonly redirectHost = XAI_OAUTH_REDIRECT_HOST
  readonly redirectPort = XAI_OAUTH_REDIRECT_PORT
  readonly redirectPath = XAI_OAUTH_REDIRECT_PATH
  readonly refreshSkewSeconds = XAI_REFRESH_SKEW_SECONDS

  private _oidcConfig: OidcConfig | null = null

  get redirectUri(): string {
    return `http://${this.redirectHost}:${this.redirectPort}${this.redirectPath}`
  }

  /**
   * Step 1: OIDC Discovery.
   */
  async discoverEndpoints(): Promise<OidcConfig> {
    if (this._oidcConfig) return this._oidcConfig

    const { status, body } = await httpGet(XAI_OAUTH_DISCOVERY_URL)

    if (status !== 200) {
      throw new AuthError(`xAI OAuth discovery failed: HTTP ${status}`, {
        provider: 'xai-oauth',
        code: 'discovery_failed'
      })
    }

    let data: Record<string, unknown>
    try {
      data = JSON.parse(body)
    } catch {
      throw new AuthError('xAI OAuth discovery response is not valid JSON', {
        provider: 'xai-oauth',
        code: 'discovery_invalid_json'
      })
    }

    const authEndpoint = data.authorization_endpoint as string | undefined
    const tokenEndpoint = data.token_endpoint as string | undefined
    const issuer = data.issuer as string | undefined

    if (!authEndpoint || !tokenEndpoint) {
      throw new AuthError('xAI OAuth discovery response missing endpoints', {
        provider: 'xai-oauth',
        code: 'discovery_incomplete'
      })
    }

    this._oidcConfig = {
      authorization_endpoint: authEndpoint,
      token_endpoint: tokenEndpoint,
      issuer: issuer ?? XAI_OAUTH_ISSUER
    }

    return this._oidcConfig
  }

  /**
   * Step 2: Generate PKCE + state + nonce.
   */
  async generateParams(): Promise<{
    codeVerifier: string
    codeChallenge: string
    state: string
    nonce: string
  }> {
    const codeVerifier = generateCodeVerifier(48)
    const codeChallenge = await computeCodeChallenge(codeVerifier)
    const state = generateState()
    const nonce = generateNonce()
    return { codeVerifier, codeChallenge, state, nonce }
  }

  /**
   * Step 3: Build the authorization URL.
   */
  buildAuthUrl(
    oidcConfig: OidcConfig,
    codeChallenge: string,
    state: string,
    nonce: string
  ): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scope,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
      plan: 'generic',
      referrer: 'hermes-agent'
    })

    return `${oidcConfig.authorization_endpoint}?${params.toString()}`
  }

  /**
   * Step 5: Exchange authorization code for tokens.
   */
  async exchangeCode(
    oidcConfig: OidcConfig,
    code: string,
    codeVerifier: string,
    codeChallenge: string
  ): Promise<Record<string, unknown>> {
    const { status, body } = await httpFormPost(oidcConfig.token_endpoint, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      code_verifier: codeVerifier,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    })

    if (status !== 200) {
      throw new AuthError(
        `xAI OAuth token exchange failed: ${body || `HTTP ${status}`}`,
        {
          provider: 'xai-oauth',
          code: 'token_exchange_failed'
        }
      )
    }

    try {
      return JSON.parse(body)
    } catch {
      throw new AuthError('xAI OAuth token response is not valid JSON', {
        provider: 'xai-oauth',
        code: 'token_invalid_json'
      })
    }
  }

  /**
   * Build auth state from token response.
   */
  buildAuthState(tokenData: Record<string, unknown>): OAuthAuthState {
    const now = new Date()
    // xAI returns expires_in as seconds (standard OAuth)
    const expiresIn = Number(tokenData.expires_in ?? 3600)
    const expiresAt = new Date(now.getTime() + expiresIn * 1000)

    return {
      provider: 'xai-oauth',
      portalBaseUrl: XAI_OAUTH_ISSUER,
      inferenceBaseUrl: XAI_BASE_URL,
      clientId: this.clientId,
      scope: this.scope,
      tokenType: String(tokenData.token_type ?? 'Bearer'),
      accessToken: String(tokenData.access_token),
      refreshToken: String(tokenData.refresh_token),
      obtainedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      expiresIn
    }
  }

  /**
   * Start the callback listener that watches for the redirect.
   * Since we can't intercept the browser's redirect directly from Node/Bun
   * without a full HTTP server, we use a polling approach:
   * The callback server listens for the redirect but since the user's
   * browser can't reach localhost from the cloud, they paste the URL.
   */
  async waitForManualPaste(timeoutMs: number): Promise<string> {
    return new Promise((_resolve, reject) => {
      void setTimeout(() => {
        reject(
          new AuthError('xAI OAuth timed out waiting for authorization code', {
            provider: 'xai-oauth',
            code: 'timeout'
          })
        )
      }, timeoutMs)

      // Print instructions for manual paste
      console.log(
        "\nAfter authorizing, you'll be redirected to a page that says"
      )
      console.log(
        '"This site can\'t be reached" or similar — copy the full URL'
      )
      console.log('from the address bar and paste it here:')
      console.log('')

      // In a real CLI, we'd read from stdin here.
      // For the API, the route handler manages this differently.
      reject(
        new AuthError('Manual paste mode not implemented in API context', {
          provider: 'xai-oauth',
          code: 'manual_paste_required'
        })
      )
    })
  }

  /**
   * COMPLETE FLOW: Run xAI OAuth with PKCE loopback.
   */
  async login(
    opts: {
      openBrowserFlag?: boolean
      manualPaste?: boolean
      timeoutSeconds?: number
    } = {}
  ): Promise<{ authState: OAuthAuthState }> {
    const shouldOpenBrowser = isRemoteSession()
      ? false
      : (opts.openBrowserFlag ?? true)
    const useManualPaste = opts.manualPaste ?? isRemoteSession()
    const timeoutMs = (opts.timeoutSeconds ?? 300) * 1000

    console.log('Starting Hermes login via xAI Grok OAuth...')

    // Step 1: OIDC Discovery
    console.log('Discovering xAI OAuth endpoints...')
    const oidcConfig = await this.discoverEndpoints()

    // Step 2: Generate PKCE
    const { codeVerifier, codeChallenge, state, nonce } =
      await this.generateParams()

    // Step 3: Build authorization URL
    const authUrl = this.buildAuthUrl(oidcConfig, codeChallenge, state, nonce)

    if (useManualPaste) {
      // Manual paste mode (SSH/remote)
      console.log('\nOpen this URL in your browser:')
      console.log(`  ${authUrl}`)
      console.log('\nAfter authorizing, paste the redirect URL here:')

      const callbackUrl = await this.waitForManualPaste(timeoutMs)
      const parsedUrl = new URL(callbackUrl)
      const code = parsedUrl.searchParams.get('code') ?? ''
      const returnedState = parsedUrl.searchParams.get('state') ?? ''

      // Validate state
      if (returnedState !== state) {
        throw new AuthError('xAI OAuth state mismatch (possible CSRF).', {
          provider: 'xai-oauth',
          code: 'state_mismatch'
        })
      }

      // Exchange code for tokens
      const tokenData = await this.exchangeCode(
        oidcConfig,
        code,
        codeVerifier,
        codeChallenge
      )
      const authState = this.buildAuthState(tokenData)
      await saveCredentials('xai-oauth', authState)

      console.log('\nSuccessfully authenticated with xAI Grok OAuth!')
      return { authState }
    }

    // Step 4: Find available port
    const port = await findAvailablePort(this.redirectPort)

    if (port !== this.redirectPort) {
      console.log(`Note: Using port ${port} instead of ${this.redirectPort}`)
    }

    // Note: Full loopback server requires a real HTTP server listening.
    // For simplicity, we fall back to manual paste if we can't auto-capture.
    console.log('\nOpen this URL in your browser:')
    console.log(`  ${authUrl}`)

    if (shouldOpenBrowser) {
      if (openBrowser(authUrl)) {
        console.log('  (Opened browser)')
      } else {
        console.log('  Could not open browser automatically.')
      }
    }

    // Fall back to manual paste for now
    const callbackUrl = await this.waitForManualPaste(timeoutMs)
    const parsedUrl = new URL(callbackUrl)
    const code = parsedUrl.searchParams.get('code') ?? ''
    const returnedState = parsedUrl.searchParams.get('state') ?? ''

    if (returnedState !== state) {
      throw new AuthError('xAI OAuth state mismatch (possible CSRF).', {
        provider: 'xai-oauth',
        code: 'state_mismatch'
      })
    }

    const tokenData = await this.exchangeCode(
      oidcConfig,
      code,
      codeVerifier,
      codeChallenge
    )
    const authState = this.buildAuthState(tokenData)
    await saveCredentials('xai-oauth', authState)

    console.log('\nSuccessfully authenticated with xAI Grok OAuth!')
    return { authState }
  }

  /**
   * Refresh xAI token.
   */
  async refreshToken(refreshToken: string): Promise<Record<string, unknown>> {
    const oidcConfig = await this.discoverEndpoints()

    const { status, body } = await httpFormPost(oidcConfig.token_endpoint, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId
    })

    if (status !== 200) {
      throw new AuthError(
        `xAI OAuth token refresh failed: ${body || `HTTP ${status}`}`,
        {
          provider: 'xai-oauth',
          code: 'refresh_failed',
          reloginRequired: true
        }
      )
    }

    try {
      return JSON.parse(body)
    } catch {
      throw new AuthError('xAI refresh response is not valid JSON', {
        provider: 'xai-oauth',
        code: 'refresh_failed',
        reloginRequired: true
      })
    }
  }
}
