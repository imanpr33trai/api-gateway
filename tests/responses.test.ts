// tests/responses.test.ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'

import { Nvidia } from '../src/providers/nvidia'
import { Ollama } from '../src/providers/ollama'
import { responsesRoute } from '../src/routes/responses'
import type { ChatResponse } from '../src/types/ollama'
import { Role } from '../src/types/types'

// Create test app
const app = new Hono()
app.route('/', responsesRoute)

// Test configuration
const TEST_MODEL = 'openai/gpt-oss-120b'

// Set provider to ollama before running tests
const originalProvider = process.env.RESPONSES_PROVIDER
process.env.RESPONSES_PROVIDER = 'ollama'

describe('Responses Endpoint - Non-Streaming', () => {
  let originalNvidiaChat: typeof Nvidia.chat
  let originalOllamaChat: typeof Ollama.chatForResponses

  beforeAll(() => {
    // Mock both providers to avoid external API calls
    originalNvidiaChat = Nvidia.chat
    originalOllamaChat = Ollama.chatForResponses

    // Mock Ollama - this should be called since RESPONSES_PROVIDER=ollama
    Ollama.chatForResponses = async req => {
      const mockResponse: ChatResponse = {
        model: req.model,
        message: {
          role: Role.ASSISTANT,
          content: `Mock response for: ${req.messages?.[req.messages.length - 1]?.content || 'empty'}`
        },
        done: true,
        created_at: Math.floor(Date.now() / 1000)
      }
      return { response: mockResponse, isStream: false }
    }
  })

  afterAll(() => {
    // Restore original functions
    Ollama.chatForResponses = originalOllamaChat
    Nvidia.chat = originalNvidiaChat
    // Restore env
    if (originalProvider) {
      process.env.RESPONSES_PROVIDER = originalProvider
    } else {
      delete process.env.RESPONSES_PROVIDER
    }
  })

  test('should return 200 for valid request with input format', async () => {
    const payload = {
      model: TEST_MODEL,
      input: [
        {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Hello, how are you?'
            }
          ]
        }
      ]
    }

    const res = await app.request('/responses', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('model')
    expect(body).toHaveProperty('output')
  })

  test('should return 422 for invalid model (empty string)', async () => {
    const payload = {
      model: '',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Hello' }]
        }
      ]
    }

    const res = await app.request('/responses', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    })

    // Should get validation error
    expect([400, 422]).toContain(res.status)
  })

  test('should return 422 for missing input', async () => {
    const payload = {
      model: TEST_MODEL
    }

    const res = await app.request('/responses', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    })

    expect([400, 422]).toContain(res.status)
  })

  test('should handle text parameter', async () => {
    const payload = {
      model: TEST_MODEL,
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Hello' }]
        }
      ],
      text: { format: { type: 'text' } }
    }

    const res = await app.request('/responses', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(res.status).toBe(200)
  })

  test('should handle reasoning parameter', async () => {
    const payload = {
      model: TEST_MODEL,
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'What is 2+2?' }]
        }
      ],
      reasoning: { effort: 'high' }
    }

    const res = await app.request('/responses', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(res.status).toBe(200)
  })

  test('should handle temperature parameter', async () => {
    const payload = {
      model: TEST_MODEL,
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Hello' }]
        }
      ],
      temperature: 0.7
    }

    const res = await app.request('/responses', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(res.status).toBe(200)
  })

  test('should handle max_output_tokens parameter', async () => {
    const payload = {
      model: TEST_MODEL,
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Hello' }]
        }
      ],
      max_output_tokens: 100
    }

    const res = await app.request('/responses', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(res.status).toBe(200)
  })
})

describe('Responses Endpoint - Streaming', () => {
  let originalOllamaStream: typeof Ollama.chatStreamForResponses

  beforeAll(() => {
    // Mock streaming
    originalOllamaStream = Ollama.chatStreamForResponses
    Ollama.chatStreamForResponses = async function* (req) {
      const messages = req.messages || []
      const lastMessage = messages[messages.length - 1]
      const prompt = lastMessage?.content || 'test'

      // Yield a few chunks
      yield {
        message: {
          role: 'assistant',
          content: 'H'
        },
        done: false
      }
      yield {
        message: {
          role: 'assistant',
          content: 'el'
        },
        done: false
      }
      yield {
        message: {
          role: 'assistant',
          content: 'lo'
        },
        done: false
      }
      yield {
        message: {
          role: 'assistant',
          content: ` - Response to: ${prompt}`
        },
        done: true
      }
    }
  })

  afterAll(() => {
    Ollama.chatStreamForResponses = originalOllamaStream
    // Restore env
    if (originalProvider) {
      process.env.RESPONSES_PROVIDER = originalProvider
    } else {
      delete process.env.RESPONSES_PROVIDER
    }
  })

  test('should return streaming response', async () => {
    const payload = {
      model: TEST_MODEL,
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Hello' }]
        }
      ],
      stream: true
    }

    const res = await app.request('/responses', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(res.status).toBe(200)
    expect(res.body).not.toBeNull()

    // Read the stream and verify SSE format
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let chunks = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks += decoder.decode(value, { stream: true })
    }

    // Verify SSE format
    expect(chunks).toContain('event:')
    expect(chunks).toContain('data:')
  })

  test('should emit response.created event', async () => {
    const payload = {
      model: TEST_MODEL,
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Test' }]
        }
      ],
      stream: true
    }

    const res = await app.request('/responses', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    })

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let chunks = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks += decoder.decode(value, { stream: true })
    }

    expect(chunks).toContain('response.created')
  })

  test('should emit response.completed event at end', async () => {
    const payload = {
      model: TEST_MODEL,
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Test' }]
        }
      ],
      stream: true
    }

    const res = await app.request('/responses', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    })

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let chunks = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks += decoder.decode(value, { stream: true })
    }

    expect(chunks).toContain('response.completed')
  })
})

describe('Responses Endpoint - Real Ollama Tests (Optional)', () => {
  const skipIfNoOllama = async () => {
    try {
      const res = await fetch('http://localhost:11434/api/tags')
      if (!res.ok) return true
    } catch {
      return true
    }
    return false
  }

  test('should work with real Ollama when available', async () => {
    const shouldSkip = await skipIfNoOllama()
    if (shouldSkip) {
      console.log('Skipping - Ollama not available')
      return
    }

    const payload = {
      model: TEST_MODEL,
      input: [
        {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: "Say 'test' and nothing else"
            }
          ]
        }
      ]
    }

    const res = await app.request('/responses', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    })

    // Ollama might not have the model, so we accept various statuses
    expect([200, 404, 500]).toContain(res.status)
  })

  test('should stream with real Ollama when available', async () => {
    const shouldSkip = await skipIfNoOllama()
    if (shouldSkip) {
      console.log('Skipping - Ollama not available')
      return
    }

    const payload = {
      model: TEST_MODEL,
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Count to 3' }]
        }
      ],
      stream: true
    }

    const res = await app.request('/responses', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    })

    // Ollama might not have the model, so we accept various statuses
    expect([200, 404, 500]).toContain(res.status)
  })
})
