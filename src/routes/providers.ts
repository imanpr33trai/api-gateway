import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import z from 'zod'

import { openAIErrorResponse } from '../lib/openai-error'
import {
  getProvider,
  listProviders,
  resolveApiKey,
  upsertProvider
} from '../providers/registry'

export const providersRouter = new Hono()

  .get('/', async c => {
    const all = await listProviders()
    return c.json({
      providers: all.map(p => ({
        name: p.name,
        displayName: p.displayName,
        description: p.description,
        authType: p.authType,
        apiMode: p.apiMode,
        baseUrl: p.baseUrl,
        fallbackModels: p.fallbackModels
      }))
    })
  })

  .get('/:name', async c => {
    const name = c.req.param('name')
    const profile = await getProvider(name)
    if (!profile) {
      return openAIErrorResponse(c, `Provider "${name}" not found`, {
        code: 'provider_not_found',
        status: 404
      })
    }
    return c.json({ provider: profile })
  })

  .get('/:name/check', async c => {
    const name = c.req.param('name')

    const profile = await getProvider(name)
    if (!profile) {
      return openAIErrorResponse(c, `Provider "${name}" not found`, {
        code: 'provider_not_found',
        status: 404
      })
    }
    const modelsUrl = profile.modelsUrl || `${profile.baseUrl}/models`
    if (!modelsUrl) {
      return openAIErrorResponse(c, 'Provider has no models endpoint', {
        code: 'invalid_request',
        status: 400
      })
    }
    try {
      const response = await fetch(modelsUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ts-oauth-provider/0.1.0'
        }
      })
      if (!response.ok) {
        return c.json({
          valid: false,
          status: response.status,
          message: `API returned HTTP ${response.status}`
        })
      }
      const data: unknown = await response.json()
      const models = Array.isArray(data)
        ? data
        : ((data as Record<string, unknown>)?.data ?? [])
      return c.json({
        valid: true,
        modelsCount: Array.isArray(models) ? models.length : 0,
        models
      })
    } catch (error) {
      return c.json({
        valid: false,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  })
  .patch(
    '/:name/api-key',
    zValidator('json', z.object({ apiKey: z.string().min(1) })),
    async c => {
      const name = c.req.param('name')
      const { apiKey } = c.req.valid('json')

      const profile = await getProvider(name)
      if (!profile) {
        return openAIErrorResponse(c, `Provider "${name}" not found`, {
          code: 'provider_not_found',
          status: 404
        })
      }

      const updated = await upsertProvider({ ...profile, apiKey })
      return c.json({ provider: updated })
    }
  )

  .post(
    '/:name/check',
    zValidator('json', z.object({ apiKey: z.string().optional() })),
    async c => {
      const name = c.req.param('name')
      const { apiKey } = c.req.valid('json')

      const profile = await getProvider(name)
      if (!profile) {
        return openAIErrorResponse(c, `Provider "${name}" not found`, {
          code: 'provider_not_found',
          status: 404
        })
      }
      const key = apiKey ?? (await resolveApiKey(name))
      if (!key) {
        return openAIErrorResponse(c, `No API key found for "${name}"`, {
          code: 'invalid_api_key',
          status: 404
        })
      }
      const modelsUrl = profile.modelsUrl || `${profile.baseUrl}/models`

      if (!modelsUrl) {
        return openAIErrorResponse(c, 'Provider has no models endpoint', {
          code: 'invalid_request',
          status: 400
        })
      }
      try {
        const response = await fetch(modelsUrl, {
          headers: {
            'Authorization': `Bearer ${key}`,
            'Accept': 'application/json',
            'User-Agent': 'ts-provider-oauth/0.1.0'
          }
        })
        if (!response.ok) {
          return c.json({
            valid: false,
            status: response.status,
            message: `API returned HTTP ${response.status}`
          })
        }

        const data: unknown = await response.json()
        const models = Array.isArray(data)
          ? data
          : ((data as Record<string, unknown>).data ?? [])
        return c.json({
          valid: true,
          modelsCount: Array.isArray(models) ? models.length : 0
        })
      } catch (err) {
        return c.json({
          valid: false,
          message: err instanceof Error ? err.message : String(err)
        })
      }
    }
  )
