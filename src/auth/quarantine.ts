/**
 * Quarantine — Dead Token Detection and Cleanup
 *
 * When an OAuth token refresh fails with a terminal error
 * (invalid_grant, token revoked, etc.), the credentials should
 * be quarantined so the next API call fails fast with a clear
 * "re-login required" message instead of an obscure HTTP 401.
 *
 * Provider-specific terminal error codes:
 *   nous:         invalid_grant, invalid_token, refresh_token_reused
 *   openai-codex: codex_refresh_failed, invalid_grant, token_expired
 *   xai-oauth:    xai_refresh_failed, invalid_grant
 *   anthropic:    invalid_grant, refresh_token_reused
 *   minimax-oauth: invalid_grant, token_revoked
 */

import { AuthError } from '../providers/types'
import { saveCredentials } from './store'

// ─── Provider-specific terminal error patterns ────────────────────

const TERMINAL_ERROR_PATTERNS: Record<string, readonly string[]> = {
  'nous': ['invalid_grant', 'invalid_token', 'refresh_token_reused'] as const,
  'openai-codex': [
    'codex_refresh_failed',
    'invalid_grant',
    'token_expired'
  ] as const,
  'xai-oauth': ['xai_refresh_failed', 'invalid_grant'] as const,
  'anthropic': ['invalid_grant', 'refresh_token_reused'] as const,
  'minimax-oauth': ['invalid_grant', 'token_revoked'] as const
}

// Provider-specific quarantine error codes for the auth store
const QUARANTINE_CODES: Record<string, string> = {
  'nous': 'nous_refresh_failed',
  'openai-codex': 'codex_refresh_failed',
  'xai-oauth': 'xai_refresh_failed',
  'anthropic': 'anthropic_refresh_failed',
  'minimax-oauth': 'minimax_refresh_failed'
}

// ─── Terminal error detection ─────────────────────────────────────

/**
 * Check if an error is a terminal auth failure for a given provider.
 * Terminal errors require re-authentication.
 */
export function isTerminalForProvider(
  provider: string,
  errorMessage: string
): boolean {
  const patterns = TERMINAL_ERROR_PATTERNS[provider]
  if (!patterns) {
    // Default patterns for unknown providers
    return ['invalid_grant', 'token_revoked', 'invalid_token'].some(p =>
      errorMessage.toLowerCase().includes(p)
    )
  }
  return patterns.some(p => errorMessage.toLowerCase().includes(p))
}

/**
 * Quarantine credentials after a terminal refresh failure.
 * Wipes the access_token, refresh_token, and sets the error info
 * with a provider-specific error code.
 */
export async function quarantineCredentials(
  providerName: string,
  error: Error
): Promise<void> {
  const errorCode = QUARANTINE_CODES[providerName] ?? 'refresh_failed'
  const errorInfo = {
    provider: providerName,
    code: errorCode,
    message: error.message,
    reason: 'runtime_refresh_failure',
    reloginRequired: true,
    at: new Date().toISOString()
  }

  // Save with wiped tokens + error info
  // We use saveCredentials with empty tokens to mark as quarantined
  try {
    const { getCredentials } = await import('./store')
    const existing = await getCredentials(providerName)
    if (existing) {
      await saveCredentials(providerName, {
        ...existing,
        accessToken: '',
        refreshToken: undefined,
        expiresAt: undefined,
        expiresIn: 0,
        lastAuthError: errorInfo
      })
    }
  } catch {
    // Best-effort — if we can't quarantine, the provider is already broken
  }
}

/**
 * Check if credentials are in a quarantined state.
 */
export function isQuarantined(creds: {
  accessToken?: string
  lastAuthError?: { reloginRequired?: boolean }
}): boolean {
  // Empty access token + last error with reloginRequired = true
  return (
    (!creds.accessToken || creds.accessToken.length < 4) &&
    creds.lastAuthError?.reloginRequired === true
  )
}

/**
 * Check if an error from a token exchange or API call indicates
 * a terminal auth failure that should trigger quarantine.
 * Delegates to provider-specific classification when provider is known.
 */
export function isTerminalAuthError(
  error: unknown,
  provider?: string
): boolean {
  if (error instanceof AuthError && error.reloginRequired) {
    return true
  }

  if (error instanceof Error) {
    const message = error.message

    // Provider-specific check
    if (provider && isTerminalForProvider(provider, message)) {
      return true
    }

    // Generic terminal patterns (fallback for unknown providers)
    const terminalPatterns = [
      'invalid_grant',
      'token revoked',
      'token_expired',
      'invalid_token',
      'access_denied',
      'unauthorized_client',
      'invalid_client',
      'oauth2 access token could not be validated'
    ]
    return terminalPatterns.some(p => message.toLowerCase().includes(p))
  }

  return false
}
