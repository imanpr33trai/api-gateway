import { createMiddleware } from 'hono/factory'

import { getConfig } from '../config'
import { buildOpenAIErrorBody } from '../lib/openai-error'

export const bodyLimit = createMiddleware(async (c, next) => {
  const cfg = getConfig()
  const maxBytes = cfg.bodySizeLimit

  const contentLength = c.req.header('Content-Length')
  if (contentLength) {
    const len = parseInt(contentLength, 10)
    if (!Number.isNaN(len) && len > maxBytes) {
      return new Response(
        JSON.stringify(
          buildOpenAIErrorBody(
            `Request too large. Maximum body size is ${(maxBytes / 1024 / 1024).toFixed(0)}MB`,
            { code: 'request_too_large', status: 413 }
          )
        ),
        { status: 413, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }
  await next()
})
