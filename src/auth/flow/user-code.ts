import {
  MINIMAX_OAUTH_CLIENT_ID,
  MINIMAX_OAUTH_CN_BASE,
  MINIMAX_OAUTH_CN_INFERENCE,
  MINIMAX_OAUTH_CODE_ENDPOINT,
  MINIMAX_OAUTH_GLOBAL_BASE,
  MINIMAX_OAUTH_GLOBAL_INFERENCE,
  MINIMAX_OAUTH_GRANT_TYPE,
  MINIMAX_OAUTH_REFRESH_SKEW_SECONDS,
  MINIMAX_OAUTH_SCOPE,
  MINIMAX_OAUTH_TOKEN_ENDPOINT
} from '../../constants'
import { openBrowser, sleep } from '../../lib/browser'
import {
  computeCodeChallenge,
  generateCodeVerifier,
  generateState,
  generateUUID
} from '../../lib/crypto'
import { httpFormPost } from '../../lib/http-client'
import { AuthError, type OAuthAuthState } from '../../types'
import { isRemoteSession } from '../../utils/minimax-utils'
import { resolveTokenExpiryUnix, saveCredentials } from '../store'

interface UserCodeResponse {
  userCode: string
  verificationUri: string
  verificationUrl: string
  expiredIn: number
  intervalMs: number
  state: string
}

export class MiniMaxOAuthProvider {
  readonly clientId = MINIMAX_OAUTH_CLIENT_ID
  readonly scope = MINIMAX_OAUTH_SCOPE
  readonly grantType = MINIMAX_OAUTH_GRANT_TYPE
  readonly refreshSkewSeconds = MINIMAX_OAUTH_REFRESH_SKEW_SECONDS

  getPortalBase(region: string): string {
    return region === 'cn' ? MINIMAX_OAUTH_CN_BASE : MINIMAX_OAUTH_GLOBAL_BASE
  }
  getInferenceBase(region: string): string {
    return region === 'cn'
      ? MINIMAX_OAUTH_CN_INFERENCE
      : MINIMAX_OAUTH_GLOBAL_INFERENCE
  }
  async generatePKCE(): Promise<{
    codeVerifier: string
    codeChallenge: string
    state: string
  }> {
    const codeVerifier = generateCodeVerifier(48)
    const codeChallenge = await computeCodeChallenge(codeVerifier)
    const state = generateState()
    return { codeChallenge, codeVerifier, state }
  }

  async requestUserCode(
    portalBaseUrl: string,
    codeChallenge: string,
    state: string
  ): Promise<UserCodeResponse> {
    const { body, status } = await httpFormPost(
      `${portalBaseUrl}${MINIMAX_OAUTH_CODE_ENDPOINT}`,
      {
        response_type: 'code',
        client_id: this.clientId,
        scope: this.scope,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state
      },
      { 'x-request-id': generateUUID() }
    )

    if (status !== 200) {
      throw new AuthError(
        `MiniMax OAuth authorization failed: ${body || `HTTP ${status}`}`,
        {
          provider: 'minimax-oauth',
          code: 'authorization_failed'
        }
      )
    }
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(body)
    } catch {
      throw new AuthError('MiniMax OAuth response is not valid JSON', {
        code: 'authorization_invalid_json',
        provider: 'minimax-oauth'
      })
    }
    for (const field of ['user_code', 'verification_uri', 'expired_in']) {
      if (!payload[field]) {
        throw new AuthError(`MiniMax OAuth response missing field: ${field}`, {
          provider: 'minimax-oauth',
          code: 'authorization_incomplete'
        })
      }
    }
    if (payload.state !== state) {
      throw new AuthError('MiniMax OAuth state mismatch (possible CSRF).', {
        provider: 'minimax-oauth',
        code: 'state_mismatch'
      })
    }
    return {
      userCode: String(payload.user_code),
      verificationUri: String(payload.verification_uri),
      expiredIn: Number(payload.expired_in),
      intervalMs: Number(payload.interval ?? 2000),
      state: String(payload.state),
      verificationUrl: String(
        payload.verification_url ?? payload.verification_uri
      )
    }
  }
  async pollToken(
    portalBaseUrl: string,
    clientId: string,
    userCode: string,
    codeVerifier: string,
    expiredIn: number,
    intervalMs: number | null
  ): Promise<Record<string, unknown>> {
    const nowMs = Date.now()
    const raw = Math.floor(expiredIn)

    let deadline: number
    if (raw > nowMs / 2) {
      deadline = raw / 1000
    } else {
      deadline = nowMs / 1000 + Math.max(1, raw)
    }
    const interval = Math.max(2.0, (intervalMs ?? 2000) / 1000.0)

    while (Date.now() / 1000 < deadline) {
      const { body, status } = await httpFormPost(
        `${portalBaseUrl}${MINIMAX_OAUTH_TOKEN_ENDPOINT}`,
        {
          grant_type: this.grantType,
          client_id: clientId,
          user_code: userCode,
          codeVerifier: codeVerifier
        }
      )
      let payload: Record<string, unknown>
      try {
        payload = body ? JSON.parse(body) : {}
      } catch {
        payload = {}
      }
      if (status !== 200) {
        const baseResp = (payload as Record<string, unknown>).base_resp as
          | Record<string, unknown>
          | undefined
        const msg = baseResp?.state_msg || body || `HTTP ${status}`
        throw new AuthError(`MiniMax OAuth error: ${msg}`, {
          provider: 'minimax-oauth',
          code: 'token_exchange_failed'
        })
      }
      const tokenStatus = payload.status as string

      if (tokenStatus === 'error') {
        throw new AuthError(
          'MiniMax oauth reported an error. Please try again later.',
          {
            provider: 'minimax-oauth',
            code: 'authorization_denied'
          }
        )
      }
      if (tokenStatus === 'success') {
        if (
          !payload.access_token ||
          !payload.refresh_token ||
          !payload.expired_in
        ) {
          throw new AuthError(
            'MiniMax OAuth success payload missing required token fields.',
            {
              provider: 'minimax-oauth',
              code: 'token_incomplete'
            }
          )
        }
        return payload
      }

      await sleep(interval * 1000)
    }
    throw new AuthError(
      'MiniMax oauth timed out before authorization completed.',
      {
        code: 'timeout',
        provider: 'minimax-oauth'
      }
    )
  }

  buildAuthState(
    tokenData: Record<string, unknown>,
    region: string,
    portalBaseUrl: string,
    inferenceBaseUrl: string
  ): OAuthAuthState {
    const now = new Date()
    const expiredIn = Number(tokenData.expired_in)
    const expiredAtUnix = resolveTokenExpiryUnix(expiredIn)
    const expiresIn = Math.max(
      0,
      Math.floor(expiredAtUnix - now.getTime() / 1000)
    )
    return {
      accessToken: String(tokenData.access_token),
      clientId: this.clientId,
      expiresIn,
      inferenceBaseUrl,
      obtainedAt: now.toISOString(),
      portalBaseUrl,
      provider: 'minimax-oauth',
      scope: this.scope,
      tokenType: String(tokenData.token_type ?? 'Bearer'),
      expiresAt: new Date(expiredAtUnix * 1000).toISOString(),
      region,
      refreshToken: String(tokenData.refresh_token)
    }
  }
  async login(opts: {
    region?: string
    openBrowserFlag?: boolean
    timesoutSeconds?: number
  }): Promise<{ authState: OAuthAuthState }> {
    const region = opts.region ?? 'global'
    const portalBaseUrl = this.getPortalBase(region)
    const inferenceBaseUrl = this.getInferenceBase(region)
    const shouldOpenBrowser = isRemoteSession()
      ? false
      : (opts.openBrowserFlag ?? true)

    console.log(`Starting Hermes login via MiniMax (${region}) OAuth...`)
    console.log(`Portal: ${portalBaseUrl}`)

    const { codeChallenge, codeVerifier, state } = await this.generatePKCE()

    const codeData = await this.requestUserCode(
      portalBaseUrl,
      codeChallenge,
      state
    )

    console.log('\nTo continue:')
    console.log(`  1. Open: ${codeData.verificationUri}`)
    console.log(`  2. If prompted, enter code: ${codeData.userCode}`)

    if (shouldOpenBrowser) {
      if (openBrowser(codeData.verificationUrl)) {
        console.log('  (Opened browser for verification)')
      } else {
        console.log(
          '  Could not open browser automatically -- use the URL above.'
        )
      }
    }
    console.log('Waiting for approval...')

    const tokenData = await this.pollToken(
      portalBaseUrl,
      this.clientId,
      codeData.userCode,
      codeVerifier,
      codeData.expiredIn,
      codeData.intervalMs
    )

    const authState = this.buildAuthState(
      tokenData,
      region,
      portalBaseUrl,
      inferenceBaseUrl
    )

    await saveCredentials('minimax-oauth', authState)
    console.log('\nSuccessfully authenticated with MiniMax OAuth!')
    return { authState }
  }
  async refreshToken(
    portalBaseUrl: string,
    clientId: string,
    refreshToken: string
  ): Promise<Record<string, unknown>> {
    const { body, status } = await httpFormPost(
      `${portalBaseUrl}${MINIMAX_OAUTH_TOKEN_ENDPOINT}`,
      {
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken
      }
    )
    if (status !== 200) {
      throw new AuthError(
        `MiniMax token refresh failed: ${body || `HTTP ${status}`}`,
        {
          provider: 'minimax-oauth',
          code: 'refresh_failed',
          reloginRequired: true
        }
      )
    }
    try {
      return JSON.parse(body)
    } catch (error: unknown) {
      throw new AuthError(
        `MiniMax token refresh failed: ${body || `HTTP ${status}`}`,
        {
          provider: 'minimax-oauth',
          code: 'refresh_failed',
          reloginRequired: true
        }
      )
    }
  }
}
