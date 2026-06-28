/**
 * Nous Portal — Device Code OAuth Flow
 *
 * OAuth 2.0 Device Authorization Grant (RFC 8628).
 *
 * Flow:
 *   1. POST /oauth/device/code → {user_code, device_code, verification_uri, interval}
 *   2. Show user_code + verification URL to user
 *   3. Poll POST /oauth/token every `interval` seconds
 *   4. Receive {access_token, refresh_token}
 */

import { isRemoteSession, openBrowser, sleep } from '../../lib/browser'
import { generateUUID } from '../../lib/crypto'
import { httpFormPost } from '../../lib/http-client'
import { AuthError, type OAuthAuthState } from '../../providers/types'
import { saveCredentials } from '../store'

// ─── Constants ────────────────────────────────────────────────────

export const NOUS_PORTAL_URL = 'https://portal.nousresearch.com'
export const NOUS_INFERENCE_URL = 'https://inference-api.nousresearch.com/v1'
export const NOUS_CLIENT_ID = 'hermes-cli'
export const NOUS_SCOPE = 'inference:invoke inference:mint_agent_key'
export const NOUS_DEVICE_CODE_ENDPOINT = '/oauth/device/code'
export const NOUS_TOKEN_ENDPOINT = '/oauth/token'
export const NOUS_REFRESH_SKEW_SECONDS = 120
export const NOUS_POLL_INTERVAL_CAP_SECONDS = 1

// ─── Types ────────────────────────────────────────────────────────

interface DeviceCodeResponse {
  userCode: string
  deviceCode: string
  verificationUri: string
  verificationUrl: string
  expiresIn: number
  interval: number
}

// ─── Nous Device Code Provider ────────────────────────────────────

export class DeviceCodeOAuthProvider {
  readonly clientId = NOUS_CLIENT_ID
  readonly scope = NOUS_SCOPE
  readonly refreshSkewSeconds = NOUS_REFRESH_SKEW_SECONDS

  /**
   * Step 1: Request device code from the provider.
   */
  async requestDeviceCode(portalBaseUrl: string): Promise<DeviceCodeResponse> {
    const { status, body } = await httpFormPost(
      `${portalBaseUrl}${NOUS_DEVICE_CODE_ENDPOINT}`,
      {
        client_id: this.clientId,
        scope: this.scope
      },
      { 'x-request-id': generateUUID() }
    )

    if (status !== 200) {
      throw new AuthError(
        `Device code request failed: ${body || `HTTP ${status}`}`,
        {
          provider: 'nous',
          code: 'device_code_failed'
        }
      )
    }

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(body)
    } catch {
      throw new AuthError('Device code response is not valid JSON', {
        provider: 'nous',
        code: 'device_code_invalid_json'
      })
    }

    // Validate required fields
    for (const field of ['user_code', 'device_code', 'verification_uri']) {
      if (!payload[field]) {
        throw new AuthError(`Device code response missing field: ${field}`, {
          provider: 'nous',
          code: 'device_code_incomplete'
        })
      }
    }

    return {
      userCode: String(payload.user_code),
      deviceCode: String(payload.device_code),
      verificationUri: String(payload.verification_uri),
      verificationUrl: String(
        payload.verification_url ?? payload.verification_uri
      ),
      expiresIn: Number(payload.expires_in ?? 300),
      interval: Math.max(
        NOUS_POLL_INTERVAL_CAP_SECONDS,
        Number(payload.interval ?? 5)
      )
    }
  }

  /**
   * Step 2: Poll for token after user authorizes in browser.
   */
  async pollToken(
    portalBaseUrl: string,
    deviceCode: string,
    expiresIn: number,
    interval: number
  ): Promise<Record<string, unknown>> {
    const deadline = Date.now() / 1000 + Math.max(1, expiresIn)

    while (Date.now() / 1000 < deadline) {
      const { status, body } = await httpFormPost(
        `${portalBaseUrl}${NOUS_TOKEN_ENDPOINT}`,
        {
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: deviceCode,
          client_id: this.clientId
        }
      )

      // 403 = authorization pending (keep polling)
      if (status === 403) {
        await sleep(interval * 1000)
        continue
      }

      if (status !== 200) {
        throw new AuthError(`Token poll failed: ${body || `HTTP ${status}`}`, {
          provider: 'nous',
          code: 'token_poll_failed'
        })
      }

      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(body)
      } catch {
        throw new AuthError('Token poll response is not valid JSON', {
          provider: 'nous',
          code: 'token_poll_invalid_json'
        })
      }

      if (payload.error === 'authorization_pending') {
        await sleep(interval * 1000)
        continue
      }
      if (
        payload.error === 'access_denied' ||
        payload.error === 'expired_token'
      ) {
        throw new AuthError(`Authorization ${payload.error}`, {
          provider: 'nous',
          code: 'authorization_denied'
        })
      }

      if (payload.access_token) {
        return payload
      }

      await sleep(interval * 1000)
    }

    throw new AuthError(
      'Device code OAuth timed out before authorization completed.',
      {
        provider: 'nous',
        code: 'timeout'
      }
    )
  }

  /**
   * Build auth state from token response.
   */
  buildAuthState(tokenData: Record<string, unknown>): OAuthAuthState {
    const now = new Date()
    const expiresIn = Number(tokenData.expires_in ?? 3600)
    const expiresAt = new Date(now.getTime() + expiresIn * 1000)

    return {
      provider: 'nous',
      portalBaseUrl: NOUS_PORTAL_URL,
      inferenceBaseUrl: NOUS_INFERENCE_URL,
      clientId: this.clientId,
      scope: this.scope,
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
   * COMPLETE FLOW: Run the full device code OAuth login.
   */
  async login(
    opts: { portalBaseUrl?: string; openBrowserFlag?: boolean } = {}
  ): Promise<{ authState: OAuthAuthState }> {
    const portalBaseUrl = opts.portalBaseUrl ?? NOUS_PORTAL_URL
    const shouldOpenBrowser = isRemoteSession()
      ? false
      : (opts.openBrowserFlag ?? true)

    console.log('Starting Hermes login via Nous Portal (Device Code) OAuth...')

    // Step 1: Request device code
    const deviceData = await this.requestDeviceCode(portalBaseUrl)

    console.log('\nTo continue:')
    console.log(`  1. Open: ${deviceData.verificationUri}`)
    console.log(`  2. Enter code: ${deviceData.userCode}`)

    if (shouldOpenBrowser) {
      if (openBrowser(deviceData.verificationUrl)) {
        console.log('  (Opened browser for verification)')
      } else {
        console.log('  Could not open browser automatically.')
      }
    }

    console.log('Waiting for approval...')

    // Step 2: Poll for token
    const tokenData = await this.pollToken(
      portalBaseUrl,
      deviceData.deviceCode,
      deviceData.expiresIn,
      deviceData.interval
    )

    // Step 3: Build auth state
    const authState = this.buildAuthState(tokenData)

    // Step 4: Persist
    await saveCredentials('nous', authState)

    console.log('\nSuccessfully authenticated with Nous Portal OAuth!')
    return { authState }
  }

  /**
   * Refresh token (if the provider supports it).
   */
  async refreshToken(
    currentRefreshToken: string
  ): Promise<Record<string, unknown>> {
    const { status, body } = await httpFormPost(
      `${NOUS_PORTAL_URL}${NOUS_TOKEN_ENDPOINT}`,
      {
        grant_type: 'refresh_token',
        refresh_token: currentRefreshToken,
        client_id: this.clientId
      }
    )

    if (status !== 200) {
      throw new AuthError(
        `Nous token refresh failed: ${body || `HTTP ${status}`}`,
        {
          provider: 'nous',
          code: 'refresh_failed',
          reloginRequired: true
        }
      )
    }

    try {
      return JSON.parse(body)
    } catch {
      throw new AuthError('Nous refresh response is not valid JSON', {
        provider: 'nous',
        code: 'refresh_failed',
        reloginRequired: true
      })
    }
  }
}
