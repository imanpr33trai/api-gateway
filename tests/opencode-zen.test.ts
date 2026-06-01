import { describe, expect, test } from 'bun:test'

import {
  ChatCompletionsTransport,
  normalizeChatCompletionsChunk
} from '../src/transport/chat-completions'

function makeTransport(): ChatCompletionsTransport {
  return new ChatCompletionsTransport()
}

function makeChatResponse(
  overrides?: Partial<Record<string, unknown>>
): Record<string, unknown> {
  return {
    id: 'chatcmpl-test123',
    object: 'chat.completion',
    created: 1748512345,
    model: 'gpt-4o',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: "Hello! I'm OpenCode Zen."
        },
        finish_reason: 'stop'
      }
    ],
    usage: {
      prompt_tokens: 25,
      completion_tokens: 42,
      total_tokens: 67
    },
    ...overrides
  }
}
describe('ChatCompletionsTransport.normalizeResponse', () => {
  test('returns content from a standard chat response', () => {
    const transport = makeTransport()
    const raw = makeChatResponse()
    const result = transport.normalizeResponse(raw)

    expect(result.content).toBe("Hello! I'm OpenCode Zen.")
    expect(result.toolCalls).toBeNull()
    expect(result.finishReason).toBe('stop')
    expect(result.usage).toEqual({
      promptTokens: 25,
      completionTokens: 42,
      totalTokens: 67
    })
  })

  test('extracts tool calls when present', () => {
    const transport = makeTransport()
    const raw = makeChatResponse({
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_abc123',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"city":"London"}'
                }
              }
            ]
          },
          finish_reason: 'tool_calls'
        }
      ]
    })

    const result = transport.normalizeResponse(raw)

    expect(result.content).toBeNull()
    expect(result.toolCalls).not.toBeNull()
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls![0]!.id).toBe('call_abc123')
    expect(result.toolCalls![0]!.name).toBe('get_weather')
    expect(result.toolCalls![0]!.arguements).toBe('{"city":"London"}')
    expect(result.finishReason).toBe('tool_calls')
  })

  test('returns null toolCalls when tool_calls array is empty', () => {
    const transport = makeTransport()
    const raw = makeChatResponse({
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'No tools here.',
            tool_calls: []
          },
          finish_reason: 'stop'
        }
      ]
    })

    const result = transport.normalizeResponse(raw)
    expect(result.toolCalls).toBeNull()
    expect(result.content).toBe('No tools here.')
  })

  test('handles empty choices gracefully', () => {
    const transport = makeTransport()
    const raw = makeChatResponse({ choices: [] })

    const result = transport.normalizeResponse(raw)

    // Should not throw; returns a sensible fallback
    expect(result.content).toBeNull()
    expect(result.finishReason).toBe('stop')
  })

  test('handles missing choices gracefully', () => {
    const transport = makeTransport()
    const raw = makeChatResponse({ choices: undefined })

    const result = transport.normalizeResponse(raw)

    expect(result.content).toBeNull()
    expect(result.finishReason).toBe('stop')
  })

  test('extracts content when message field is missing (legacy format)', () => {
    const transport = makeTransport()
    const raw = makeChatResponse({
      choices: [
        {
          index: 0,
          text: 'Legacy text response',
          finish_reason: 'stop'
        }
      ]
    })

    // Remove the message field to simulate older API format
    delete (raw.choices as Record<string, unknown>[])[0]!.message

    const result = transport.normalizeResponse(raw)

    expect(result.content).toBe('Legacy text response')
  })

  test('returns null when accessToken is missing (OpenCode Zen error)', () => {
    const transport = makeTransport()
    const raw = {
      id: 'chatcmpl-error',
      object: 'chat.completion',
      model: 'gpt-4o',
      choices: [
        {
          index: 0,
          finish_reason: 'error'
        }
      ]
    }

    const result = transport.normalizeResponse(raw)

    // Should not crash; content depends on implementation
    expect(result.finishReason).toBe('error')
  })

  test('returns usage null when usage is absent', () => {
    const transport = makeTransport()
    const raw = makeChatResponse({
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'No usage reported.' },
          finish_reason: 'stop'
        }
      ]
    })
    delete raw.usage

    const result = transport.normalizeResponse(raw)
    expect(result.usage).toBeNull()
  })

  test('handles reasoning content if present (provider extension)', () => {
    const transport = makeTransport()
    const raw = makeChatResponse({
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Final answer.',
            reasoning: 'First I thought about X, then Y...'
          },
          finish_reason: 'stop'
        }
      ]
    })

    const result = transport.normalizeResponse(raw)

    expect(result.content).toBe('Final answer.')
    expect(result.reasoning).toBe('First I thought about X, then Y...')
  })

  test('handles content_filter finish reason', () => {
    const transport = makeTransport()
    const raw = makeChatResponse({
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: null },
          finish_reason: 'content_filter'
        }
      ]
    })

    const result = transport.normalizeResponse(raw)
    expect(result.finishReason).toBe('content_filter')
  })
})

// ─── normalizeStreamChunk ─────────────────────────────────────────

describe('normalizeChatCompletionsChunk', () => {
  test('returns text delta for content chunk', () => {
    const chunk = {
      choices: [{ index: 0, delta: { content: 'Hello' } }]
    }

    const result = normalizeChatCompletionsChunk(chunk)
    expect(result).toEqual({ type: 'text', content: 'Hello' })
  })

  test('returns null for empty choices', () => {
    const chunk = { choices: [] }
    expect(normalizeChatCompletionsChunk(chunk)).toBeNull()
  })

  test('returns null for missing choices', () => {
    const chunk = {}
    expect(normalizeChatCompletionsChunk(chunk)).toBeNull()
  })

  test('returns done with finish reason for final chunk', () => {
    // SSE final chunk has no `delta` field — only finish_reason
    const chunk = {
      choices: [{ index: 0, finish_reason: 'stop' }]
    }

    const result = normalizeChatCompletionsChunk(chunk)
    expect(result).toEqual({ type: 'done', finishReason: 'stop', usage: null })
  })

  test('returns done with usage when present', () => {
    const chunk = {
      choices: [{ index: 0, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
    }

    const result = normalizeChatCompletionsChunk(chunk)
    expect(result).toMatchObject({
      type: 'done',
      finishReason: 'stop'
    })
    if (result?.type === 'done') {
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30
      })
    }
  })

  test('returns tool_call_start for new tool call', () => {
    const chunk = {
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_abc',
                type: 'function',
                function: { name: 'get_weather', arguments: '' }
              }
            ]
          }
        }
      ]
    }

    const result = normalizeChatCompletionsChunk(chunk)
    expect(result).toEqual({
      type: 'tool_call_start',
      id: 'call_abc',
      name: 'get_weather',
      index: 0
    })
  })

  test('returns tool_call_delta for incremental arguments', () => {
    const chunk = {
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                function: { arguments: '{"city":"' }
              }
            ]
          }
        }
      ]
    }

    const result = normalizeChatCompletionsChunk(chunk)
    expect(result).toEqual({
      type: 'tool_call_delta',
      content: '{"city":"',
      index: 0
    })
  })

  test('handles reasoning delta (OpenCode Zen extension)', () => {
    const chunk = {
      choices: [
        {
          index: 0,
          delta: {
            reasoning: "I'm thinking through this step by step..."
          }
        }
      ]
    }

    const result = normalizeChatCompletionsChunk(chunk)
    expect(result).toEqual({
      type: 'reasoning',
      content: "I'm thinking through this step by step..."
    })
  })

  test('returns tool_calls finish reason for tool call completion', () => {
    const chunk = {
      choices: [{ index: 0, finish_reason: 'tool_calls' }]
    }

    const result = normalizeChatCompletionsChunk(chunk)
    expect(result).toEqual({
      type: 'done',
      finishReason: 'tool_calls',
      usage: null
    })
  })

  test('returns length finish reason for truncated response', () => {
    const chunk = {
      choices: [{ index: 0, finish_reason: 'length' }]
    }

    const result = normalizeChatCompletionsChunk(chunk)
    expect(result).toEqual({
      type: 'done',
      finishReason: 'length',
      usage: null
    })
  })
})

// ─── convertTools ──────────────────────────────────────────────────

describe('ChatCompletionsTransport.convertTools', () => {
  test('formats tools as OpenAI functions', () => {
    const transport = makeTransport()
    const tools = [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the weather',
          parameters: {
            type: 'object',
            properties: { city: { type: 'string' } }
          }
        }
      }
    ]

    const result = transport.convertTools(tools)

    expect(result).toHaveLength(1)
    expect(result[0]!.type).toBe('function')
    expect(result[0]!.function).toBeDefined()
  })

  test('handles nested function field', () => {
    const transport = makeTransport()
    const tools = [
      {
        name: 'get_weather',
        description: 'Get the weather',
        parameters: { type: 'object' }
      }
    ]

    const result = transport.convertTools(tools)

    expect(result).toHaveLength(1)
    expect(result[0]!.type).toBe('function')
    expect(result[0]!.function).toBeDefined()
  })
})

// ─── convertMessages ──────────────────────────────────────────────

describe('ChatCompletionsTransport.convertMessages', () => {
  test('strips internal fields from messages', () => {
    const transport = makeTransport()
    const messages = [
      {
        role: 'user',
        content: 'Hello',
        codex_reasoning_items: ['internal'],
        codex_message_items: ['internal'],
        call_id: 'internal'
      }
    ]

    const result = transport.convertMessages(messages)

    expect(result).toHaveLength(1)
    expect(result[0]!.role).toBe('user')
    expect(result[0]!.content).toBe('Hello')
    expect(result[0]!.codex_reasoning_items).toBeUndefined()
    expect(result[0]!.codex_message_items).toBeUndefined()
    expect(result[0]!.call_id).toBeUndefined()
  })
})

// ─── buildKwargs ──────────────────────────────────────────────────

describe('ChatCompletionsTransport.buildKwargs', () => {
  test('builds basic request body', () => {
    const transport = makeTransport()
    const kwargs = transport.buildKwargs(
      'openai/gpt-4o',
      [{ role: 'user', content: 'Hi' }],
      undefined,
      { maxTokens: 2048 }
    )

    expect(kwargs.model).toBe('openai/gpt-4o')
    expect(kwargs.messages).toBeDefined()
    expect(kwargs.messages as Record<string, unknown>[]).toHaveLength(1)
    expect(kwargs.max_tokens).toBe(2048)
  })

  test('includes tools when provided', () => {
    const transport = makeTransport()
    const tools = [{ type: 'function', function: { name: 'test' } }]

    const kwargs = transport.buildKwargs(
      'openai/gpt-4o',
      [{ role: 'user', content: 'Use a tool' }],
      tools,
      { maxTokens: 4096 }
    )

    expect(kwargs.tools).toBeDefined()
    expect(kwargs.tools as unknown[]).toHaveLength(1)
    expect(kwargs.tool_choice).toBe('auto')
    expect(kwargs.parallel_tool_calls).toBe(true)
  })

  test('includes temperature when provided', () => {
    const transport = makeTransport()
    const kwargs = transport.buildKwargs(
      'openai/gpt-4o',
      [{ role: 'user', content: 'Hi' }],
      undefined,
      { maxTokens: 4096, temperature: 0.7 }
    )

    expect(kwargs.temperature).toBe(0.7)
  })
})

// ─── validateResponse ─────────────────────────────────────────────

describe('ChatCompletionsTransport.validateResponse', () => {
  test('returns true when choices are present', () => {
    const transport = makeTransport()
    expect(transport.validateResponse({ choices: [] })).toBe(true)
  })

  test('returns false when choices are missing', () => {
    const transport = makeTransport()
    expect(transport.validateResponse({})).toBe(false)
  })
})

// ─── mapFinishReason ──────────────────────────────────────────────

describe('ChatCompletionsTransport.mapFinishReason', () => {
  test('passes through known reasons', () => {
    const transport = makeTransport()
    expect(transport.mapFinishReason('stop')).toBe('stop')
    expect(transport.mapFinishReason('length')).toBe('length')
    expect(transport.mapFinishReason('tool_calls')).toBe('tool_calls')
    expect(transport.mapFinishReason('content_filter')).toBe('content_filter')
  })

  test('maps function_call to tool_calls', () => {
    const transport = makeTransport()
    expect(transport.mapFinishReason('function_call')).toBe('tool_calls')
  })

  test('passes through unknown reasons', () => {
    const transport = makeTransport()
    expect(transport.mapFinishReason('custom_reason')).toBe('custom_reason')
  })
})
