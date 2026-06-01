import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'

import { getCredentials } from '../auth/store'
import { openAIErrorResponse } from '../lib/openai-error'
import {
  getAuthHeader,
  getProvider,
  resolveApiKey
} from '../providers/registry'
import { getTransport } from '../transport/base'
import { ChatCompletionRequestSchema, parseSSELine } from '../transport/types'
import { AuthError } from '../types'

export const chatRouter = new Hono()

  .post(
    '/chat/completions',
    zValidator('json', ChatCompletionRequestSchema),
    async c => {
      const req = c.req.valid('json')
      const providerName = (
        c.req.header('X-Provider') ?? 'openai'
      ).toLowerCase()
      const profile = await getProvider(providerName)
      if (!profile) {
        return openAIErrorResponse(c, `Unknown provider: ${providerName}`, {
          code: 'provider_not_found',
          status: 404
        })
      }

      const transport = getTransport(profile.apiMode)
      if (!transport) {
        return openAIErrorResponse(
          c,
          `No transport for api_mode: ${profile.apiMode}`,
          {
            code: 'not_implemented',
            status: 500
          }
        )
      }
      const apiKey = await resolveCredentials(providerName, profile)

      const kwargs = transport.buildKwargs(
        req.model,
        req.messages as Record<string, unknown>[],
        req.tools as Record<string, unknown>[],
        {
          maxTokens: req.maxTokens,
          temperature: req.temperature,
          reasoningConfig: req.reasoningConfig,
          providerPreferences: req.providerPreferences,
          provider: providerName
        }
      )
      kwargs.stream = req.stream

      const baseUrl = profile.baseUrl

      if (!baseUrl) {
        return openAIErrorResponse(
          c,
          `Provider "${providerName}" has no base URL configured`,
          {
            code: 'invalid_request',
            status: 400
          }
        )
      }

      if (req.stream) {
        return streamSSE(c, async sseStream => {
          const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
          const headers: Record<string, string> = {
            'Content-Type': 'applications/json',
            'Accept': 'text/event-stream',
            'User-Agent': 'ts-provider-oauth/0.1.0'
          }
          Object.assign(
            headers,
            getAuthHeader(apiKey, profile.authType, baseUrl)
          )

          if (kwargs.extra_headers) {
            Object.assign(
              headers,
              kwargs.extra_headers as Record<string, string>
            )
            delete kwargs.extra_headers
          }

          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(kwargs)
          })
          if (!response.ok) {
            const body = await response.text().catch(() => '')
            await sseStream.writeSSE({
              data: JSON.stringify({
                error: `API error (HTTP ${response.status}) : ${body}`
              }),
              event: 'error'
            })
            return
          }

          const reader = response.body?.getReader()
          if (!reader) {
            await sseStream.writeSSE({
              event: 'error',
              data: JSON.stringify({ error: 'NO response body' })
            })
            return
          }
          const decoder = new TextDecoder()
          let buffer = ''
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })

              const lines = buffer.split('\n')
              buffer = lines.pop() ?? ''

              for (const line of lines) {
                const parsed = parseSSELine(line)
                if (!parsed) continue

                const chunk = transport.normalizeStreamChunk(parsed)
                if (!chunk) continue

                await sseStream.writeSSE({
                  event: 'chunk',
                  data: JSON.stringify(chunk)
                })
                if (chunk.type === 'done') {
                  if (chunk.usage) {
                    await sseStream.writeSSE({
                      event: 'usage',
                      data: JSON.stringify(chunk.usage)
                    })
                  }
                }
              }
            }
            if (buffer.trim()) {
              const parsed = parseSSELine(buffer)
              if (parsed) {
                const chunk = transport.normalizeStreamChunk(parsed)
                if (chunk) {
                  await sseStream.writeSSE({
                    event: 'chunk',
                    data: JSON.stringify(chunk)
                  })
                }
              }
            }
          } catch (err) {
            await sseStream.writeSSE({
              data: JSON.stringify({ error: String(err) }),
              event: 'error'
            })
          } finally {
            reader.releaseLock()
          }
        })
      }
      const response = await makeApiRequest(
        baseUrl,
        kwargs,
        apiKey,
        profile.authType
      )
      const normalized = transport.normalizeResponse(response)

      const rawResponse = response as Record<string, unknown>
      return c.json({
        id: (rawResponse.id as string | undefined) ?? `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: req.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: normalized.content,
              tool_calls: normalized.toolCalls
                ? normalized.toolCalls.map(tc => ({
                    id: tc.id,
                    type: 'function',
                    function: {
                      name: tc.name,
                      arguments: tc.arguements
                    }
                  }))
                : undefined
            },
            finish_reason: normalized.finishReason
          }
        ],
        usage: normalized.usage ?? undefined
      })
    }
  )

async function resolveCredentials(
  providerName: string,
  profile: { authType: string; envVars: string[] }
): Promise<string> {
  if (profile.authType.startsWith('oauth')) {
    const creds = await getCredentials(providerName)
    if (!creds || !creds.accessToken) {
      throw new AuthError(
        `Provider "${providerName} requires OAuth login. POST /api/auth/login first."`,
        {
          provider: providerName,
          code: 'login_required'
        }
      )
    }
    //QUARANTINE CONDITION
    //AUTO-REFRESH IF EXPIRING
    // if (isExpiring(creds.expiresAt, 60) && creds.refreshToken) {
    //   try {
    //     // const refreshed = await refresh
    //   } catch (error: unknown) {
    //     console.error(error)
    //   }
    // }
  }
  const key = await resolveApiKey(providerName)
  if (!key) {
    throw new AuthError(
      `NO API key found for provider "${providerName}". Set ${profile.envVars.join(' or ')} env var.`,
      { provider: providerName, code: 'api_key_required' }
    )
  }
  return key
}

async function makeApiRequest(
  baseUrl: string,
  kwargs: Record<string, unknown>,
  apiKey: string,
  authType: string
): Promise<unknown> {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
  const headers: Record<string, string> = {
    'Content-Type': 'aplication/json',
    'Accept': 'application/json',
    'User-Agent': 'ts-provider-oauth/0.1.0'
  }

  Object.assign(headers, getAuthHeader(apiKey, authType, baseUrl))

  if (kwargs.extra_headers) {
    Object.assign(headers, kwargs.extra_headers as Record<string, string>)
    delete kwargs.extra_headers
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(kwargs)
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`API error (HTTP ${response.status}): ${body}`)
  }
  return response.json()
}
