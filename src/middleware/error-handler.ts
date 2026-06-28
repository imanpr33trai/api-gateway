/**
 * Error Handler Middleware — catches all unhandled errors and returns
 * an OpenAI-compatible error response.
 *
 * Features:
 *   - OpenAI-compatible JSON error format
 *   - Error categorization (auth, provider, transient, policy)
 *   - Secret redaction in error messages
 *   - Structured error codes
 */

import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'

import { classifyError } from '../lib/error-categorizer'
import { buildOpenAIErrorBody } from '../lib/openai-error'
import { redactSecrets } from '../lib/secret-redactor'
import { AuthError } from '../providers/types'

export function errorHandler(err: Error, c: Context): Response {
  // ── HTTPException (from Hono middleware: validator, body-limit, etc.) ─
  if (err instanceof HTTPException) {
    return c.json(
      buildOpenAIErrorBody(err.message, {
        code: err.status === 400 ? 'invalid_request' : 'api_error',
        status: err.status
      }),
      err.status
    )
  }

  // ── AuthErrors (structured application errors) ──────────────
  if (err instanceof AuthError) {
    const code =
      err.code === 'login_required'
        ? 'login_required'
        : err.code === 'relogin_required'
          ? 'relogin_required'
          : err.code === 'api_key_required'
            ? 'invalid_api_key'
            : 'invalid_request'

    const status =
      code === 'login_required' || code === 'invalid_api_key'
        ? 401
        : code === 'relogin_required'
          ? 401
          : 400

    return c.json(
      buildOpenAIErrorBody(err.message, {
        code,
        status,
        type:
          code === 'invalid_api_key'
            ? 'authentication_error'
            : 'invalid_request_error'
      }),
      status
    )
  }

  // ── Known error classes ─────────────────────────────────────
  if (err.name === 'SyntaxError' || err.name === 'ZodError') {
    return c.json(
      buildOpenAIErrorBody(redactSecrets(err.message), {
        code: 'invalid_request',
        status: 400
      }),
      400
    )
  }

  if (err.name === 'AbortError') {
    return c.json(
      buildOpenAIErrorBody('Request timed out.', {
        code: 'provider_timeout',
        status: 504
      }),
      504
    )
  }

  // ── Classify unknown errors ─────────────────────────────────
  const classified = classifyError(err)
  const safeMessage = redactSecrets(classified.userSafeMessage)

  return c.json(
    buildOpenAIErrorBody(safeMessage, {
      code: classified.code,
      status:
        classified.code === 'invalid_api_key'
          ? 401
          : classified.code === 'provider_timeout'
            ? 504
            : classified.code === 'service_unavailable'
              ? 503
              : classified.code === 'rate_limit_exceeded'
                ? 429
                : 500,
      type:
        classified.code === 'invalid_api_key'
          ? 'authentication_error'
          : classified.code === 'rate_limit_exceeded'
            ? 'rate_limit_error'
            : 'api_error'
    }),
    500
  )
}
