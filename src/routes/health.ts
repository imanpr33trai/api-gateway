/**
 * Detailed Health Route — GET /health/detailed, GET /v1/health
 *
 * Rich health check with gateway state, uptime, PID, and platform status.
 */

import { Hono } from 'hono'

import { getConfig } from '../config'
import { listProviders } from '../providers/registry'
import { listTransportModes } from '../transport/base'

export const healthDetailedRouter = new Hono()

// ─── GET /health/detailed — Rich health ──────────────────────────

healthDetailedRouter.get('/health/detailed', async c => {
  const cfg = getConfig()
  const transports = listTransportModes()
  const providerCount = (await listProviders()).length

  return c.json({
    status: 'ok',
    uptime: process.uptime(),
    pid: process.pid,
    memory: {
      rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
    },
    config: {
      port: cfg.port,
      host: cfg.host,
      logLevel: cfg.logLevel,
      apiKeyConfigured: !!cfg.apiKey,
      rateLimiting: cfg.enableRateLimiting,
      securityHeaders: cfg.enableSecurityHeaders
    },
    transports: {
      registered: transports,
      count: transports.length
    },
    providers: {
      loaded: providerCount,
      hasDb: providerCount > 0
    },
    timestamp: new Date().toISOString()
  })
})

// ─── GET /v1/health — Namespaced health check ───────────────────

healthDetailedRouter.get('/v1/health', c => {
  return c.json({
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString()
  })
})
