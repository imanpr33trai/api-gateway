/**
 * ts-provider-oauth — TypeScript Port of Hermes Agent's Provider & OAuth System
 *
 * Hono + Bun + Zod + Drizzle + Drizzle-Zod
 *
 * Run:
 *   bun dev          # watch mode
 *   bun start        # production
 */

import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'

import { getConfig, loadConfig } from './config'
import { runNetworkGuard } from './middleware/network-guard'

// ─── Load config before anything else ──────────────────────────────
loadConfig()
const cfg = getConfig()

// ─── Transport auto-registration ─────────────────────────────────
// Importing these triggers registerTransport() at import time.

// import './transport/anthropic-messages'
// import './transport/bedrock-converse'
import './transport/chat-completions'
// import './transport/codex-responses'

// ─── Middleware ──────────────────────────────────────────────────
import { apiKeyAuth } from './middleware/api-key-auth'
import { bodyLimit } from './middleware/body-limit'
// import { domainRateLimit } from './middleware/domain-ratelimit'
import { errorHandler } from './middleware/error-handler'
// import { createOriginCors } from './middleware/origin-cors'
// import { rateLimiter } from './middleware/rate-limiter'
// import { securityHeaders } from './middleware/security-headers'
// ─── Seed ─────────────────────────────────────────────────────────
import { ALL_PROVIDER_PROFILES } from './providers/profiles'
import { ensureProfilesLoaded, upsertProvider } from './providers/registry'
import { authRouter } from './routes/auth'
// import { capabilitiesRouter } from './routes/capabilities'
import { chatRouter } from './routes/chat'
// import { conversationsRouter } from './routes/conversations'
import { dashboardRouter } from './routes/dashboard'
// import { freeChatRouter } from './routes/free-chat'
// import { healthDetailedRouter } from './routes/health'
import { healthDetailedRouter } from './routes/health'
// import { jobsRouter } from './routes/jobs'
// import { messagesRouter } from './routes/messages'
import { providersRouter } from './routes/providers'
// import { responsesRouter } from './routes/responses'
// import { runsRouter } from './routes/runs'

async function seedProviders(): Promise<void> {
  try {
    await ensureProfilesLoaded()
  } catch {
    console.log('Note: DB not available for seed (will retry on first request)')
  }

  for (const profile of ALL_PROVIDER_PROFILES) {
    try {
      await upsertProvider(profile)
    } catch (err) {
      console.debug(`Seed provider ${profile.name}: ${(err as Error).message}`)
    }
  }
  console.log(`Seeded ${ALL_PROVIDER_PROFILES.length} provider profiles`)
}

// ─── App ──────────────────────────────────────────────────────────

const app = new Hono()

// Middleware (order matters — they run in registration order)
app.use('*', logger())
app.use('*', prettyJSON())
app.use('*', bodyLimit)
// app.use('*', securityHeaders)
app.use('*', apiKeyAuth)
// app.use('*', rateLimiter)
// app.use('*', domainRateLimit())
// app.use('*', createOriginCors())

// Error handler
app.onError(errorHandler)
app.notFound(c => c.json({ error: 'Not found' }, 404))

// Routes
// app.route('/', healthRouter)
app.route('/', healthDetailedRouter)
app.route('/api/providers', providersRouter)
app.route('/api/auth', authRouter)
app.route('/api', dashboardRouter)
// app.route('/api', jobsRouter)
// app.route('/v1', freeChatRouter)
app.route('/v1', chatRouter)
// app.route('/v1', responsesRouter)
// app.route('/v1', runsRouter)
// app.route('/v1', capabilitiesRouter)
// app.route('/v1', messagesRouter)
// app.route('/api', conversationsRouter)

// ─── Scheduler ─────────────────────────────────────────────────────
// import { startScheduler } from './jobs/scheduler'

// Startup seed
seedProviders().catch(err => console.error('Seed error:', err))

// Start cron scheduler
// startScheduler()

// ─── Server ──────────────────────────────────────────────────────

export { app }

const port = cfg.port ?? parseInt(process.env.PORT ?? '3000', 10)
const host = cfg.host ?? '127.0.0.1'

// Run network guard before starting
runNetworkGuard()
  .then(() => {
    console.log(`Server starting on http://${host}:${port}`)
    console.log(`Health: http://localhost:${port}/health`)
    console.log(`Providers: http://localhost:${port}/api/providers`)
    console.log(`Auth: http://localhost:${port}/api/auth/providers`)
    console.log(`Chat: http://localhost:${port}/v1/chat/completions`)
    console.log(`Responses: http://localhost:${port}/v1/responses`)
    console.log(`Runs: http://localhost:${port}/v1/runs`)
    console.log(`Jobs: http://localhost:${port}/api/jobs`)
    console.log(`Status: http://localhost:${port}/api/status`)
    console.log(`Capabilities: http://localhost:${port}/v1/capabilities`)

    Bun.serve({
      fetch: app.fetch,
      hostname: host,
      port
    })
  })
  .catch((err: Error) => {
    console.error(`Network guard failed: ${err.message}`)
    process.exit(1)
  })
