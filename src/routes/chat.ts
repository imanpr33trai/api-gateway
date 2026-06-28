/**
 * Chat Completions Route — POST /v1/chat/completions
 *
 * Routes to the correct provider transport, resolves credentials,
 * makes the API call, and normalizes the response.
 *
 * When stream=true, returns SSE stream of normalized StreamChunks
 * that the frontend can consume directly.
 */

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'

import { refresh } from '../auth/engine'
import { isQuarantined } from '../auth/quarantine'
import { getCredentials, isExpiring } from '../auth/store'
import { openAIErrorResponse } from '../lib/openai-error'
import {
  getAuthHeader,
  getProvider,
  resolveApiKey
} from '../providers/registry'
import { AuthError } from '../providers/types'
import { getTransport } from '../transport/base'
import { ChatCompletionRequestSchema, parseSSELine } from '../transport/types'

export const chatRouter = new Hono()

// POST /v1/chat/completions
chatRouter.post(
  '/chat/completions',
  // Validate JSON body before zValidator — returns 400 on malformed/empty
  async (c, next) => {
    const rawText = await c.req.raw.clone().text()
    if (!rawText.trim()) {
      return openAIErrorResponse(c, 'Request body is empty', {
        code: 'invalid_request',
        status: 400
      })
    }
    try {
      JSON.parse(rawText)
    } catch {
      return openAIErrorResponse(c, 'Invalid JSON in request body', {
        code: 'invalid_request',
        status: 400
      })
    }
    return next()
  },
  zValidator('json', ChatCompletionRequestSchema),
  async c => {
    const req = c.req.valid('json')

    // Determine provider:
    // 1. Use X-Provider header if set explicitly
    // 2. Otherwise extract from model name (format: "provider/model")
    // 3. Fall back to "openai" if no slash in model name
    let providerName = c.req.header('X-Provider')
    if (!providerName) {
      const slashIdx = req.model.indexOf('/')
      providerName = slashIdx !== -1 ? req.model.slice(0, slashIdx) : 'openai'
    }

    // 1. Resolve provider profile
    const profile = await getProvider(providerName)
    if (!profile) {
      return openAIErrorResponse(c, `Unknown provider: ${providerName}`, {
        code: 'provider_not_found',
        status: 404
      })
    }

    // Route free providers to the free chat handler
    // if (profile.authType === 'free' || profile.authType === 'none') {
    //   const { routeFreeCompletion, hasFreeProvider } =
    //     await import('../providers/free/index')
    //   if (hasFreeProvider(providerName)) {
    //     return streamSSE(c, async stream => {
    //       try {
    //         for await (const chunk of routeFreeCompletion(providerName, {
    //           model: req.model,
    //           messages: req.messages as Array<{
    //             role: string
    //             content: string
    //           }>,
    //           stream: true,
    //           maxTokens: req.maxTokens,
    //           temperature: req.temperature
    //         })) {
    //           if (chunk.type === 'done') {
    //             await stream.writeSSE({
    //               event: 'done',
    //               data: JSON.stringify({
    //                 finishReason: chunk.finishReason,
    //                 usage: chunk.usage
    //               })
    //             })
    //             break
    //           }
    //           // Deconstruct chunk fields to match free-chat.ts SSE format
    //           const data: Record<string, unknown> = {}
    //           if (chunk.type === 'text') data.content = chunk.content
    //           if (chunk.type === 'reasoning') data.reasoning = chunk.content
    //           if (chunk.type === 'tool_call_start') {
    //             data.id = chunk.id
    //             data.name = chunk.name
    //           }
    //           if (chunk.type === 'tool_call_delta') data.content = chunk.content
    //           await stream.writeSSE({
    //             event: chunk.type,
    //             data: JSON.stringify(data)
    //           })
    //         }
    //       } catch (err) {
    //         await stream.writeSSE({
    //           event: 'error',
    //           data: JSON.stringify({ error: String(err) })
    //         })
    //       }
    //     })
    //   }
    // }

    // 2. Get transport for the provider's api_mode
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

    // 3. Resolve credentials
    const apiKey = await resolveCredentials(providerName, profile)

    // 4. Build kwargs via transport, add stream flag
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
        `Provider '${providerName}' has no base URL configured`,
        {
          code: 'invalid_request',
          status: 400
        }
      )
    }

    // ── Streaming branch ─────────────────────────────────────
    if (req.stream) {
      return streamSSE(c, async sseStream => {
        const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'User-Agent': 'ts-provider-oauth/0.1.0'
        }
        Object.assign(headers, getAuthHeader(apiKey, profile.authType, baseUrl))

        // Merge extra headers from kwargs
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
          await sseStream.writeSSE({
            event: 'error',
            data: JSON.stringify({
              error: `API error (HTTP ${response.status}): ${body}`
            })
          })
          return
        }

        const reader = response.body?.getReader()
        if (!reader) {
          await sseStream.writeSSE({
            event: 'error',
            data: JSON.stringify({ error: 'No response body' })
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

            // Process complete lines
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? '' // keep incomplete line in buffer

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
                // Send usage as separate event if present
                if (chunk.usage) {
                  await sseStream.writeSSE({
                    event: 'usage',
                    data: JSON.stringify(chunk.usage)
                  })
                }
              }
            }
          }

          // Flush remaining buffer
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
            event: 'error',
            data: JSON.stringify({ error: String(err) })
          })
        } finally {
          reader.releaseLock()
        }
      })
    }

    // ── Non-streaming branch ─────────────────────────────────
    try {
      const response = await makeApiRequest(
        baseUrl,
        kwargs,
        apiKey,
        profile.authType
      )

      // 6. Normalize response
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
                      arguments: tc.arguments
                    }
                  }))
                : undefined
            },
            finish_reason: normalized.finishReason
          }
        ],
        usage: normalized.usage ?? undefined
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upstream API error'
      return openAIErrorResponse(c, message, {
        code: 'provider_error',
        status: 502
      })
    }
  }
)

/**
 * Resolve credentials for a provider (API key or OAuth token).
 */
async function resolveCredentials(
  providerName: string,
  profile: { authType: string; envVars: string[] }
): Promise<string> {
  // OAuth providers
  if (profile.authType.startsWith('oauth')) {
    const creds = await getCredentials(providerName)
    if (!creds || !creds.accessToken) {
      throw new AuthError(
        `Provider '${providerName}' requires OAuth login. POST /api/auth/login first.`,
        {
          provider: providerName,
          code: 'login_required'
        }
      )
    }

    if (isQuarantined(creds)) {
      throw new AuthError(
        `OAuth credentials for '${providerName}' are invalid. Please re-login.`,
        {
          provider: providerName,
          code: 'relogin_required',
          reloginRequired: true
        }
      )
    }

    // Auto-refresh if expiring
    if (isExpiring(creds.expiresAt, 60) && creds.refreshToken) {
      try {
        const refreshed = await refresh(providerName)
        return refreshed.accessToken
      } catch {
        // Use existing token if refresh fails
        return creds.accessToken
      }
    }

    return creds.accessToken
  }

  // API key providers
  const key = await resolveApiKey(providerName)
  if (!key) {
    throw new AuthError(
      `No API key found for provider '${providerName}'. Set ${profile.envVars.join(' or ')} env var.`,
      { provider: providerName, code: 'api_key_required' }
    )
  }

  return key
}

/**
 * Make an HTTP request to the provider's chat completions endpoint.
 */
async function makeApiRequest(
  baseUrl: string,
  kwargs: Record<string, unknown>,
  apiKey: string,
  authType: string
): Promise<unknown> {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'ts-provider-oauth/0.1.0'
  }
  Object.assign(headers, getAuthHeader(apiKey, authType, baseUrl))

  // Merge extra headers from kwargs
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
