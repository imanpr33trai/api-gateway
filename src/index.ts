// import './transport/acp'
// import './transport/anthropic-messages'
// import './transport/bedrock-converse'
import './transport/chat-completions'
// import './transport/codex-responses'

// src/index.ts
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'

import { ALL_PROVIDER_PROFILES } from './providers/profiles'
import { ensureProfileLoaded, upsertProvider } from './providers/registry'
import { apiKeysRouter } from './routes/api-keys'
import { authEndpointsRouter } from './routes/auth-endpoints'
import { chatRouter } from './routes/chat'
import { providersRouter } from './routes/providers'

async function seedProviders(): Promise<void> {
  try {
    await ensureProfileLoaded()
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

const app = new Hono()

app.use('*', logger())
app.use('*', prettyJSON())
// app.use('*', bodyLimit)
// app.use('*', securityHeaders)
// app.use('*', apiKeyAuth)
// app.use('*', rateLimiter)
// app.use('*', createOriginCors()) // Models endpoint
// app.route('/', modelsRoute)

app.route('/api/providers', providersRouter)
app.route('/api', apiKeysRouter)
app.route('/auth', authEndpointsRouter)
app.route('/v1', chatRouter)

seedProviders().catch(err => console.log('Seed error:', err))
export default app
