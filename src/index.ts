// src/index.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import { chatController } from './controller/chat.controller'
import { modelsRoute } from './routes/models'

const app = new Hono()

// Middleware
app.use('*', cors())
app.use('*', logger())

// ============ Routes ============

// Health check
app.get('/health', c => {
  return c.json({
    status: 'ok',
    version: '1.0.0',
    providers: ['nvidia'],
    default_model: 'openai/gpt-oss-120b'
  })
})

// Models endpoint
app.route('/', modelsRoute)

// Chat Completions API (OpenAI-compatible pass-through)
app.post('/v1/chat/completions', chatController)

// ============ Error Handling ============
app.onError((err, c) => {

  return c.json(
    {
      id: 'resp_error',
      object: 'response',
      status: 'failed',
      error: { code: 'internal_error', message: err.message }
    },
    500
  )
})

export default {
  port: parseInt(process.env.PORT || '8000', 10),
  fetch: app.fetch
}
