import { Hono } from 'hono'

import { getConfig } from '../config'
import { listProviders } from '../providers/registry'

export const dashboardRouter = new Hono().get('/status', async c => {
  const cfg = getConfig()
  const providers = await listProviders()

  return c.json({
    server: {
      port: cfg.port,
      host: cfg.host,
      uptime: process.uptime(),
      pid: process.pid,
      memory: process.memoryUsage()
    },
    providers: {
      total: providers.length,
      byAuthType: providers.reduce(
        (acc, p) => {
          acc[p.authType] = (acc[p.authType] ?? 0) + 1
          return acc
        },
        {} as Record<string, number>
      )
    }
  })
})
