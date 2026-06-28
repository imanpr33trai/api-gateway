// oxlint-disable typescript/no-unsafe-type-assertion
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

import { openAIErrorResponse } from '../lib/openai-error'
import {
  fetchModels,
  getProvider,
  listProviders,
  resolveApiKey
} from '../providers/registry'
export const providersRouter = new Hono()

// GET /api/providers — list all providers
providersRouter.get('/', async c => {
  const all = await listProviders()
  return c.json({
    providers: all.map(p => ({
      name: p.name,
      displayName: p.displayName,
      description: p.description,
      authType: p.authType,
      apiMode: p.apiMode,
      baseUrl: p.baseUrl,
      fallbackModels: p.fallbackModels,
      isFree: p.authType === 'free' || p.authType === 'none'
    }))
  })
})

// GET /api/providers/:name — get provider detail
providersRouter.get('/:name', async c => {
  const name = c.req.param('name')
  const profile = await getProvider(name)
  if (!profile) {
    return openAIErrorResponse(c, `Provider '${name}' not found`, {
      code: 'provider_not_found',
      status: 404
    })
  }
  return c.json({ provider: profile })
})

// POST /api/providers/:name/check — verify API key works
providersRouter.post(
  '/:name/check',
  zValidator(
    'json',
    z.object({
      apiKey: z.string().optional()
    })
  ),
  async c => {
    const name = c.req.param('name')
    const { apiKey } = c.req.valid('json')

    const profile = await getProvider(name)
    if (!profile) {
      return openAIErrorResponse(c, `Provider '${name}' not found`, {
        code: 'provider_not_found',
        status: 404
      })
    }

    const key = apiKey ?? (await resolveApiKey(name))
    if (!key) {
      // Free/none providers don't need API key for model listing
      if (profile.authType === 'free' || profile.authType === 'none') {
        try {
          const modelsUrl = profile.modelsUrl || `${profile.baseUrl}/models`
          const res = await fetch(modelsUrl)
          const data: unknown = await res.json()
          const models = Array.isArray(data)
            ? data
            : ((data as Record<string, unknown>)?.data ?? [])
          return c.json({
            valid: true,
            modelsCount: Array.isArray(models) ? models.length : 0,
            note: 'Free provider — no API key required'
          })
        } catch (err) {
          return c.json({
            valid: false,
            message: `Free provider check failed: ${err instanceof Error ? err.message : String(err)}`
          })
        }
      }
      return openAIErrorResponse(c, `No API key found for '${name}'`, {
        code: 'invalid_api_key',
        status: 404
      })
    }

    // Test the /models endpoint as a health check
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
        : ((data as Record<string, unknown>)?.data ?? [])

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

// POST /api/providers/:name/models — fetch live models from a provider
providersRouter.post(
  '/:name/models',
  zValidator(
    'json',
    z.object({
      apiKey: z.string().optional()
    })
  ),
  async c => {
    const name = c.req.param('name')
    c.req.valid('json')
    const profile = await getProvider(name)
    if (!profile) {
      return c.json({ error: `Provider '${name}' not found` }, 404)
    }
    try {
      const models = await fetchModels(name)
      return c.json({
        provider: name,
        modelsCount: Array.isArray(models) ? models.length : 0,
        models
      })
    } catch (err) {
      return c.json({
        error: err instanceof Error ? err.message : 'Unknown error'
      })
    }
  }
)
