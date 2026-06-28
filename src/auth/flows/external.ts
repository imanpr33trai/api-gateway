/**
 * External OAuth — Managed Flows (Codex, Qwen)
 *
 * These providers manage their OAuth flow externally via their own
 * device-auth endpoints. Hermes doesn't run the full OAuth dance;
 * instead it calls the provider's device auth API and manages the
 * resulting tokens.
 *
 * Flow:
 *   Codex: Device auth → poll → code exchange → persist
 *   Qwen:  Read creds file → refresh → write back
 */

import { sleep } from '../../lib/browser'
import { generateUUID } from '../../lib/crypto'
import { httpFormPost } from '../../lib/http-client'
import { AuthError, type OAuthAuthState } from '../../providers/types'
import { saveCredentials } from '../store'

// ─── Codex OAuth Constants ───────────────────────────────────────

export const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
export const CODEX_DEVICE_AUTH_URL =
  'https://auth.openai.com/api/accounts/deviceauth'
export const CODEX_OAUTH_TOKEN_URL = 'https://auth.openai.com/oauth/token'
export const CODEX_REFRESH_SKEW_SECONDS = 120

// ─── Qwen OAuth Constants ────────────────────────────────────────

export const QWEN_CLIENT_ID = 'f0304373b74a44d2b584a3fb70ca9e56'
export const QWEN_OAUTH_TOKEN_URL = 'https://chat.qwen.ai/api/v1/oauth2/token'
export const QWEN_BASE_URL = 'https://portal.qwen.ai/v1'
export const QWEN_REFRESH_SKEW_SECONDS = 120

// ─── Codex OAuth Provider ─────────────────────────────────────────

export class CodexOAuthProvider {
  readonly clientId = CODEX_CLIENT_ID
  readonly refreshSkewSeconds = CODEX_REFRESH_SKEW_SECONDS

  /**
   * Step 1: Start device auth flow.
   */
  async startDeviceAuth(): Promise<{
    userCode: string
    deviceAuthId: string
    interval: number
  }> {
    const { status, body } = await httpFormPost(
      `${CODEX_DEVICE_AUTH_URL}/usercode`,
      { client_id: this.clientId },
      { 'x-request-id': generateUUID() }
    )

    if (status !== 200) {
      throw new AuthError(
        `Codex device auth failed: ${body || `HTTP ${status}`}`,
        {
          provider: 'openai-codex',
          code: 'device_auth_failed'
        }
      )
    }

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(body)
    } catch {
      throw new AuthError('Codex device auth response is not valid JSON', {
        provider: 'openai-codex',
        code: 'device_auth_invalid_json'
      })
    }

    return {
      userCode: String(payload.user_code ?? ''),
      deviceAuthId: String(payload.device_auth_id ?? ''),
      interval: Number(payload.interval ?? 5)
    }
  }

  /**
   * Step 2: Poll device auth status.
   */
  async pollDeviceAuth(
    deviceAuthId: string,
    userCode: string,
    interval: number
  ): Promise<{ code: string; codeVerifier: string }> {
    const deadline = Date.now() / 1000 + 300 // 5 min timeout

    while (Date.now() / 1000 < deadline) {
      const { status, body } = await httpFormPost(
        `${CODEX_DEVICE_AUTH_URL}/token`,
        {
          device_auth_id: deviceAuthId,
          user_code: userCode
        }
      )

      // 403/404 = pending — keep polling
      if (status === 403 || status === 404) {
        await sleep(interval * 1000)
        continue
      }

      if (status !== 200) {
        throw new AuthError(
          `Codex device auth poll failed: ${body || `HTTP ${status}`}`,
          {
            provider: 'openai-codex',
            code: 'device_auth_poll_failed'
          }
        )
      }

      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(body)
      } catch {
        throw new AuthError(
          'Codex device auth poll response is not valid JSON',
          {
            provider: 'openai-codex',
            code: 'device_auth_poll_invalid'
          }
        )
      }

      const authorizationCode = payload.authorization_code as string | undefined
      const codeVerifier = payload.code_verifier as string | undefined

      if (authorizationCode) {
        return { code: authorizationCode, codeVerifier: codeVerifier ?? '' }
      }

      await sleep(interval * 1000)
    }

    throw new AuthError('Codex OAuth timed out.', {
      provider: 'openai-codex',
      code: 'timeout'
    })
  }

  /**
   * Step 3: Exchange authorization code for OAuth tokens.
   */
  async exchangeCode(
    code: string,
    codeVerifier: string
  ): Promise<Record<string, unknown>> {
    const { status, body } = await httpFormPost(CODEX_OAUTH_TOKEN_URL, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'https://auth.openai.com/deviceauth/callback',
      client_id: this.clientId,
      code_verifier: codeVerifier
    })

    if (status !== 200) {
      throw new AuthError(
        `Codex token exchange failed: ${body || `HTTP ${status}`}`,
        {
          provider: 'openai-codex',
          code: 'token_exchange_failed'
        }
      )
    }

    try {
      return JSON.parse(body)
    } catch {
      throw new AuthError('Codex token response is not valid JSON', {
        provider: 'openai-codex',
        code: 'token_invalid_json'
      })
    }
  }

  /**
   * Build auth state.
   */
  buildAuthState(tokenData: Record<string, unknown>): OAuthAuthState {
    const now = new Date()
    const expiresIn = Number(tokenData.expires_in ?? 3600)
    const expiresAt = new Date(now.getTime() + expiresIn * 1000)

    return {
      provider: 'openai-codex',
      portalBaseUrl: 'https://auth.openai.com',
      inferenceBaseUrl: 'https://chatgpt.com/backend-api/codex',
      clientId: this.clientId,
      scope: '',
      tokenType: String(tokenData.token_type ?? 'Bearer'),
      accessToken: String(tokenData.access_token),
      refreshToken: tokenData.refresh_token
        ? String(tokenData.refresh_token)
        : undefined,
      obtainedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      expiresIn
    }
  }

  /**
   * COMPLETE FLOW: Login via Codex device auth.
   */
  async login(): Promise<{ authState: OAuthAuthState }> {
    console.log('Starting OpenAI Codex OAuth...')

    const deviceData = await this.startDeviceAuth()
    console.log(
      `\nOpen this URL in your browser:\n  https://auth.openai.com/codex/device`
    )
    console.log(`\nAnd enter the code: ${deviceData.userCode}`)
    console.log('\nWaiting for authorization...')

    const { code, codeVerifier } = await this.pollDeviceAuth(
      deviceData.deviceAuthId,
      deviceData.userCode,
      deviceData.interval
    )

    const tokenData = await this.exchangeCode(code, codeVerifier)
    const authState = this.buildAuthState(tokenData)
    await saveCredentials('openai-codex', authState)

    console.log('\nSuccessfully authenticated with OpenAI Codex!')
    return { authState }
  }

  /**
   * Refresh Codex token.
   */
  async refreshToken(refreshToken: string): Promise<Record<string, unknown>> {
    const { status, body } = await httpFormPost(CODEX_OAUTH_TOKEN_URL, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId
    })

    if (status !== 200) {
      throw new AuthError(
        `Codex token refresh failed: ${body || `HTTP ${status}`}`,
        {
          provider: 'openai-codex',
          code: 'refresh_failed',
          reloginRequired: true
        }
      )
    }

    try {
      return JSON.parse(body)
    } catch {
      throw new AuthError('Codex refresh response is not valid JSON', {
        provider: 'openai-codex',
        code: 'refresh_failed',
        reloginRequired: true
      })
    }
  }
}

// ─── Qwen OAuth Provider ──────────────────────────────────────────

export class QwenOAuthProvider {
  readonly clientId = QWEN_CLIENT_ID

  /**
   * Refresh Qwen token.
   * Qwen stores credentials in ~/.qwen/oauth_creds.json
   * and the refresh is a simple POST to the token endpoint.
   */
  async refreshToken(): Promise<Record<string, unknown>> {
    // Qwen uses a file-based credential store
    const homedir = process.env.HOME || process.env.USERPROFILE || ''
    const credsPath = `${homedir}/.qwen/oauth_creds.json`

    let creds: Record<string, unknown>
    try {
      const fs = await import('node:fs')
      const raw = fs.readFileSync(credsPath, 'utf-8')
      creds = JSON.parse(raw)
    } catch {
      throw new AuthError(
        'Qwen OAuth credentials not found. Please login via the Qwen CLI first.',
        {
          provider: 'qwen-oauth',
          code: 'credentials_not_found'
        }
      )
    }

    const refreshToken = creds.refresh_token as string | undefined
    if (!refreshToken) {
      throw new AuthError(
        'Qwen OAuth has no refresh token. Please re-authenticate.',
        {
          provider: 'qwen-oauth',
          code: 'no_refresh_token'
        }
      )
    }

    const { status, body } = await httpFormPost(QWEN_OAUTH_TOKEN_URL, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId
    })

    if (status !== 200) {
      throw new AuthError(
        `Qwen token refresh failed: ${body || `HTTP ${status}`}`,
        {
          provider: 'qwen-oauth',
          code: 'refresh_failed',
          reloginRequired: true
        }
      )
    }

    try {
      const tokenData = JSON.parse(body)

      // Write updated credentials back
      const fs = await import('node:fs')
      const updatedCreds = { ...creds, ...tokenData }
      fs.writeFileSync(
        credsPath,
        JSON.stringify(updatedCreds, null, 2),
        'utf-8'
      )

      return tokenData
    } catch {
      throw new AuthError('Qwen refresh response is not valid JSON', {
        provider: 'qwen-oauth',
        code: 'refresh_failed',
        reloginRequired: true
      })
    }
  }

  /**
   * Get the current Qwen access token from the credential file.
   */
  async getAccessToken(): Promise<string> {
    const homedir = process.env.HOME || process.env.USERPROFILE || ''
    const credsPath = `${homedir}/.qwen/oauth_creds.json`

    try {
      const fs = await import('node:fs')
      const raw = fs.readFileSync(credsPath, 'utf-8')
      const creds = JSON.parse(raw)
      return String(creds.access_token ?? '')
    } catch {
      throw new AuthError('Qwen OAuth credentials not found.', {
        provider: 'qwen-oauth',
        code: 'credentials_not_found'
      })
    }
  }
}
