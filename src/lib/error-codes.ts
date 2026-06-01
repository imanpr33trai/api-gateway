/**
 * Error Codes — central registry of all structured error codes.
 *
 * Each entry defines the HTTP status and OpenAI-compatible error type.
 * Using `as const` for literal type inference so consumers get
 * autocomplete on error codes.
 */

export const ERROR_CODES = {
  // ── Authentication ───────────────────────────────────────────
  invalid_api_key: { status: 401, type: 'invalid_request_error' as const },
  insufficient_quota: { status: 429, type: 'rate_limit_error' as const },
  token_expired: { status: 401, type: 'authentication_error' as const },
  login_required: { status: 401, type: 'authentication_error' as const },
  relogin_required: { status: 401, type: 'authentication_error' as const },
  api_key_required: { status: 401, type: 'authentication_error' as const },

  // ── Provider / Model ────────────────────────────────────────
  model_not_found: { status: 404, type: 'invalid_request_error' as const },
  context_length_exceeded: {
    status: 400,
    type: 'invalid_request_error' as const
  },
  rate_limit_exceeded: { status: 429, type: 'rate_limit_error' as const },
  provider_error: { status: 502, type: 'api_error' as const },
  model_unavailable: { status: 503, type: 'api_error' as const },
  provider_timeout: { status: 504, type: 'api_error' as const },

  // ── Request errors ──────────────────────────────────────────
  invalid_request: { status: 400, type: 'invalid_request_error' as const },
  invalid_content_part: { status: 400, type: 'invalid_request_error' as const },
  unsupported_content_type: {
    status: 400,
    type: 'invalid_request_error' as const
  },
  invalid_image_url: { status: 400, type: 'invalid_request_error' as const },
  request_too_large: { status: 413, type: 'invalid_request_error' as const },

  // ── Resource errors ─────────────────────────────────────────
  not_found: { status: 404, type: 'invalid_request_error' as const },
  run_not_found: { status: 404, type: 'invalid_request_error' as const },
  job_not_found: { status: 404, type: 'invalid_request_error' as const },
  provider_not_found: { status: 404, type: 'invalid_request_error' as const },

  // ── Internal ────────────────────────────────────────────────
  internal_error: { status: 500, type: 'api_error' as const },
  service_unavailable: { status: 503, type: 'api_error' as const },
  not_implemented: { status: 501, type: 'api_error' as const },

  // ── Policy ──────────────────────────────────────────────────
  content_policy_violation: {
    status: 400,
    type: 'invalid_request_error' as const
  },
  refusal: { status: 400, type: 'invalid_request_error' as const }
} as const

export type ErrorCode = keyof typeof ERROR_CODES

/**
 * Get the HTTP status and error type for a given error code.
 */
export function getErrorMeta(code: ErrorCode): {
  status: number
  type: string
} {
  const entry = ERROR_CODES[code]
  if (!entry) return { status: 500, type: 'api_error' }
  return { status: entry.status, type: entry.type }
}

/**
 * Check if a string is a known error code.
 */
export function isErrorCode(value: string): value is ErrorCode {
  return value in ERROR_CODES
}
