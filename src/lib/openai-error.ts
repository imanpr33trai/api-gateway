import type { Context } from 'hono'

import { getErrorMeta, type ErrorCode } from './error-codes'

export interface OpenAIGetErrorOptions {
  type?: string
  code?: ErrorCode
  param?: string
  status?: number
}

export function buildOpenAIErrorBody(
  message: string,
  opts: OpenAIGetErrorOptions
): Record<string, unknown> {
  const meta =
    opts.code && opts.code in getErrorMeta(opts.code as ErrorCode)
      ? getErrorMeta(opts.code as ErrorCode)
      : {
          status: opts.status ?? 400,
          type: opts.type ?? 'invalid_request_error'
        }

  return {
    error: {
      message,
      type: opts.type ?? meta.type,
      code: opts.code ?? null,
      param: opts.param ?? null
    }
  }
}
export function openAIErrorResponse(
  _c: Context,
  message: string,
  opts: OpenAIGetErrorOptions = {}
): Response {
  const meta =
    opts.code && opts.code in getErrorMeta(opts.code as ErrorCode)
      ? getErrorMeta(opts.code as ErrorCode)
      : {
          status: opts.status ?? 400,
          type: opts.type ?? 'invalid_request_error'
        }

  const status = opts.status ?? meta.status
  return new Response(JSON.stringify(buildOpenAIErrorBody(message, opts)), {
    status: status,
    headers: { 'Content-Type': 'application/json' }
  })
}

/**
 * Shortcut for common error patterns.
 */
export const ApiErrors = {
  invalidAPIKey: (c: Context) =>
    openAIErrorResponse(c, 'Incorrect API key provided.', {
      code: 'invalid_api_key',
      status: 401
    }),

  modelNotFound: (c: Context, model: string) =>
    openAIErrorResponse(c, `The model '${model}' does not exist.`, {
      code: 'model_not_found',
      status: 404
    }),

  notFound: (c: Context, resource: string) =>
    openAIErrorResponse(c, `${resource} not found.`, {
      code: 'not_found',
      status: 404
    }),

  rateLimited: (c: Context, retryAfter: number) =>
    openAIErrorResponse(c, 'Rate limit exceeded. Try again later.', {
      code: 'rate_limit_exceeded',
      status: 429,
      param: String(retryAfter)
    }),

  invalidRequest: (c: Context, message: string, param?: string) =>
    openAIErrorResponse(c, message, {
      code: 'invalid_request',
      status: 400,
      param
    }),

  internal: (c: Context, message = 'Internal server error.') =>
    openAIErrorResponse(c, message, {
      code: 'internal_error',
      status: 500
    }),

  providerError: (c: Context, message: string) =>
    openAIErrorResponse(c, message, {
      code: 'provider_error',
      status: 502
    })
}
