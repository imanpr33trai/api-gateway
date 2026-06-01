// src/index.ts
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'

import { providersRouter } from './routes/providers'

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

export default app
