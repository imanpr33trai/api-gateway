/**
 * Error Categorizer — classifies provider/network errors into categories.
 *
 * Mirrors Hermes' error classification in gateway/run.py for:
 *   - Auth errors: invalid API key, quota exceeded, token expired
 *   - Provider errors: model not found, context length, rate limit
 *   - Transient errors: timeouts, connection errors, service unavailable
 *   - Policy violations: content filter, refusal
 */

// ─── Error categories ─────────────────────────────────────────────

export type ErrorCategory =
  | 'auth'
  | 'provider'
  | 'transient'
  | 'policy'
  | 'unknown'

export interface ClassifiedError {
  category: ErrorCategory
  code: string
  message: string
  userSafeMessage: string
  isRetryable: boolean
}

// ─── Classification patterns ──────────────────────────────────────

type PatternRule = {
  patterns: RegExp[]
  category: ErrorCategory
  code: string
  userSafeMessage: string
  isRetryable: boolean
}

const CLASSIFICATION_RULES: PatternRule[] = [
  // ── Auth errors ──────────────────────────────────────────────
  {
    patterns: [
      /invalid\s*api.?key/i,
      /incorrect\s*api.?key/i,
      /authentication.*required/i,
      /unauthorized/i
    ],
    category: 'auth',
    code: 'invalid_api_key',
    userSafeMessage: 'Authentication failed. Check your API key.',
    isRetryable: false
  },
  {
    patterns: [
      /insufficient.*quota/i,
      /exceeded.*quota/i,
      /payment.*required/i,
      /billing/i
    ],
    category: 'auth',
    code: 'insufficient_quota',
    userSafeMessage: 'API quota exceeded. Check your billing plan.',
    isRetryable: false
  },
  {
    patterns: [/token.*expir/i, /refresh.*token/i, /invalid.*grant/i],
    category: 'auth',
    code: 'token_expired',
    userSafeMessage: 'OAuth token expired. Please re-authenticate.',
    isRetryable: true
  },

  // ── Provider / Model errors ──────────────────────────────────
  {
    patterns: [
      /model.*not found/i,
      /not_found/i,
      /model_not_found/i,
      /does not exist/i
    ],
    category: 'provider',
    code: 'model_not_found',
    userSafeMessage: 'The requested model is not available for this provider.',
    isRetryable: false
  },
  {
    patterns: [
      /context.*length.*exceed/i,
      /maximum.*context/i,
      /too many tokens/i,
      /token.*limit/i
    ],
    category: 'provider',
    code: 'context_length_exceeded',
    userSafeMessage: "Input exceeds the model's maximum context length.",
    isRetryable: false
  },
  {
    patterns: [/rate.?limit/i, /too many requests/i, /429/i],
    category: 'provider',
    code: 'rate_limit_exceeded',
    userSafeMessage: 'Rate limited by the provider. Please wait and retry.',
    isRetryable: true
  },

  // ── Transient errors ─────────────────────────────────────────
  {
    patterns: [
      /timeout/i,
      /timed.?out/i,
      /read.*timeout/i,
      /connect.*timeout/i
    ],
    category: 'transient',
    code: 'provider_timeout',
    userSafeMessage: 'The provider took too long to respond. Please retry.',
    isRetryable: true
  },
  {
    patterns: [
      /connection.*refused/i,
      /connection.*reset/i,
      /econnrefused/i,
      /econnreset/i,
      /enotfound/i,
      /fetch.*failed/i,
      /network.*error/i
    ],
    category: 'transient',
    code: 'service_unavailable',
    userSafeMessage: 'Could not reach the provider. Check your network.',
    isRetryable: true
  },
  {
    patterns: [/service.*unavail/i, /overloaded/i, /502/i, /503/i, /504/i],
    category: 'transient',
    code: 'service_unavailable',
    userSafeMessage: 'The provider is temporarily unavailable. Please retry.',
    isRetryable: true
  },

  // ── Policy violations ──────────────────────────────────────
  {
    patterns: [
      /content.*policy/i,
      /content.*filter/i,
      /safety.*system/i,
      /harmful.*content/i
    ],
    category: 'policy',
    code: 'content_policy_violation',
    userSafeMessage:
      "The request was filtered by the provider's content policy.",
    isRetryable: false
  },
  {
    patterns: [
      /refus/i,
      /cannot.*fulfill/i,
      /i.*cannot.*answer/i,
      /i.*can.*not.*answer/i,
      /sorry.*cannot/i
    ],
    category: 'policy',
    code: 'refusal',
    userSafeMessage: 'The model refused to respond. Try rephrasing.',
    isRetryable: false
  }
]

// ─── Classification function ──────────────────────────────────────

/**
 * Classify an error message into a category with user-safe message.
 */
export function classifyError(error: Error | string): ClassifiedError {
  const message = typeof error === 'string' ? error : error.message

  for (const rule of CLASSIFICATION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(message)) {
        return {
          category: rule.category,
          code: rule.code,
          message,
          userSafeMessage: rule.userSafeMessage,
          isRetryable: rule.isRetryable
        }
      }
    }
  }

  return {
    category: 'unknown',
    code: 'internal_error',
    message,
    userSafeMessage: 'An unexpected error occurred.',
    isRetryable: true
  }
}
