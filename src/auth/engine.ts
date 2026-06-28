/**
 * Auth engine — orchestrates OAuth flows per user.

 * This is the main entry point for OAuth operations. It dispatches
 * to the correct flow implementation based on the provider's
 * OAuth flow type, and provides unified refresh + quarantine.
 * All credential operations are scoped by userId for multi-tenant support.
 */

import { getProvider } from '../providers/registry'
import type { AuthStatus, OAuthAuthState } from '../providers/types'
import { AuthError } from '../providers/types'
import { DeviceCodeOAuthProvider } from './flows/device-code'
import { CodexOAuthProvider, QwenOAuthProvider } from './flows/external'
import { XAIOAuthProvider } from './flows/pkce-loopback'
import { MiniMaxOAuthProvider } from './flows/user-code'
import { isTerminalAuthError, quarantineCredentials } from './quarantine'
import {
  clearCredentials,
  getCredentials,
  resolveTokenExpiryUnix,
  saveCredentials
} from './store'

// ─── Flow Registry ───────────────────────────────────────────────

/**
 * Login — run OAuth login flow for a user.
 */
export async function login(
  userId: number,
  providerName: string,
  options: {
    region?: string
    openBrowser?: boolean
    manualPaste?: boolean
    timeoutSeconds?: number
  } = {}
): Promise<OAuthAuthState> {
  const profile = await getProvider(providerName)
  if (!profile) {
    throw new AuthError(`Unknown provider: ${providerName}`, {
      provider: providerName,
      code: 'unknown_provider'
    })
  }

  const oauthConfig = profile.oauthConfig
  if (!oauthConfig) {
    throw new AuthError(`Provider '${providerName}' is not an OAuth provider`, {
      provider: providerName,
      code: 'not_oauth'
    })
  }

  const flowType = oauthConfig.flowType
  let authState: OAuthAuthState

  switch (flowType) {
    case 'user_code': {
      // MiniMax-style user code grant
      const provider = new MiniMaxOAuthProvider()
      const result = await provider.login({
        region: options.region,
        openBrowserFlag: options.openBrowser,
        timeoutSeconds: options.timeoutSeconds
      })
      authState = result.authState
      break
    }

    case 'authorization_code': {
      // xAI-style PKCE loopback
      const provider = new XAIOAuthProvider()
      const result = await provider.login({
        openBrowserFlag: options.openBrowser,
        manualPaste: options.manualPaste,
        timeoutSeconds: options.timeoutSeconds
      })
      authState = result.authState
      break
    }

    case 'device_code': {
      // Nous-style device code
      const provider = new DeviceCodeOAuthProvider()
      const result = await provider.login({
        portalBaseUrl:
          (oauthConfig.portalBaseUrl as string) ??
          'https://portal.nousresearch.com',
        openBrowserFlag: options.openBrowser
      })
      authState = result.authState
      break
    }

    case 'external_process': {
      // Codex / Qwen external managed flows
      if (providerName === 'openai-codex') {
        const provider = new CodexOAuthProvider()
        const result = await provider.login()
        authState = result.authState
      } else if (providerName === 'qwen-oauth') {
        // Qwen uses file-based auth — just verify it works
        const provider = new QwenOAuthProvider()
        const token = await provider.getAccessToken()
        authState = {
          provider: 'qwen-oauth',
          portalBaseUrl:
            (oauthConfig.portalBaseUrl as string) ?? 'https://chat.qwen.ai',
          inferenceBaseUrl: profile.baseUrl,
          clientId: (oauthConfig.clientId as string) ?? '',
          scope: (oauthConfig.scope as string) ?? '',
          tokenType: 'Bearer',
          accessToken: token,
          obtainedAt: new Date().toISOString(),
          expiresIn: 3600
        }
      } else {
        throw new AuthError(
          `External OAuth flow not implemented for provider '${providerName}'`,
          {
            provider: providerName,
            code: 'flow_not_implemented'
          }
        )
      }
      break
    }

    default: {
      throw new AuthError(`Unsupported OAuth flow type: ${flowType}`, {
        provider: providerName,
        code: 'unsupported_flow'
      })
    }
  }

  // Persist credentials with userId
  await saveCredentials(providerName, authState, userId)
  return authState
}

/**
 * Refresh an OAuth token for a given user+provider.
 */
export async function refresh(
  providerName: string,
  userId: number = 0
): Promise<OAuthAuthState> {
  const profile = await getProvider(providerName)
  if (!profile) {
    throw new AuthError(`Unknown provider: ${providerName}`, {
      provider: providerName,
      code: 'unknown_provider'
    })
  }

  const creds = await getCredentials(providerName, userId)
  if (!creds || !creds.refreshToken) {
    throw new AuthError(`No refresh token available for ${providerName}`, {
      provider: providerName,
      code: 'no_refresh_token'
    })
  }

  try {
    let tokenData: Record<string, unknown>

    switch (providerName) {
      case 'minimax-oauth': {
        const provider = new MiniMaxOAuthProvider()
        tokenData = await provider.refreshToken(
          creds.portalBaseUrl,
          creds.clientId,
          creds.refreshToken
        )
        break
      }
      case 'xai-oauth': {
        const provider = new XAIOAuthProvider()
        tokenData = await provider.refreshToken(creds.refreshToken)
        break
      }
      case 'nous': {
        const provider = new DeviceCodeOAuthProvider()
        tokenData = await provider.refreshToken(creds.refreshToken)
        break
      }
      case 'openai-codex': {
        const provider = new CodexOAuthProvider()
        tokenData = await provider.refreshToken(creds.refreshToken)
        break
      }
      default: {
        throw new AuthError(
          `Token refresh not implemented for provider '${providerName}'`,
          {
            provider: providerName,
            code: 'refresh_not_implemented'
          }
        )
      }
    }

    // Build updated auth state
    const expiredIn = Number(
      tokenData.expired_in ?? tokenData.expires_in ?? 3600
    )
    const now = new Date()
    const expiresAtUnix =
      providerName === 'minimax-oauth'
        ? resolveTokenExpiryUnix(expiredIn)
        : now.getTime() / 1000 + expiredIn

    const updated: OAuthAuthState = {
      ...creds,
      accessToken: String(
        tokenData.access_token ?? tokenData.accessToken ?? creds.accessToken
      ),
      refreshToken: String(
        tokenData.refresh_token ?? tokenData.refreshToken ?? creds.refreshToken
      ),
      obtainedAt: now.toISOString(),
      expiresAt: new Date(expiresAtUnix * 1000).toISOString(),
      expiresIn: Math.max(0, Math.floor(expiresAtUnix - now.getTime() / 1000)),
      lastAuthError: undefined
    }

    await saveCredentials(providerName, updated, userId)
    return updated
  } catch (err) {
    if (err instanceof Error && isTerminalAuthError(err)) {
      await quarantineCredentials(providerName, err)
    }
    throw err
  }
}

/**
 * Get the auth status for a user+provider.
 */
export async function getStatus(
  userId: number,
  providerName: string
): Promise<AuthStatus> {
  const profile = await getProvider(providerName)
  if (!profile) {
    return {
      loggedIn: false,
      provider: providerName,
      authType: 'none'
    }
  }

  const creds = await getCredentials(providerName, userId)

  if (!creds || !creds.accessToken || creds.accessToken.length < 4) {
    return {
      loggedIn: false,
      provider: providerName,
      authType: profile.authType,
      error: creds?.lastAuthError?.message,
      apiBaseUrl: profile.baseUrl
    }
  }

  return {
    loggedIn: true,
    provider: providerName,
    region: creds.region,
    expiresAt: creds.expiresAt,
    authType: profile.authType,
    hasRefreshToken: !!creds.refreshToken,
    clientId: creds.clientId,
    scope: creds.scope,
    apiBaseUrl: creds.inferenceBaseUrl || profile.baseUrl
  }
}

/**
 * Logout (clear credentials) for a user+provider.
 */
export async function logout(
  userId: number,
  providerName: string
): Promise<void> {
  await clearCredentials(providerName, userId)
}
