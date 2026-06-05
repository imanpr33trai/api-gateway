import { describe, test } from 'bun:test'
import { Hono } from 'hono'

import { chatRouter } from '../src/routes/chat'
import type { ChatCompletionRequest } from '../src/transport/types'
import { Role } from '../src/types'

// Mock the main app to include the chatRoute
const app = new Hono()
app.route('/', chatRouter)

describe('Chat Endpoint Test', () => {
  test('should log the response from the /chat endpoint', async () => {
    // Simulate a request to the /chat endpoint
    const res = await fetch('https://opencode.ai/zen/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'big-pickle',
        messages: [{ content: 'Hlo', role: Role.USER }],
        stream: true
      } satisfies ChatCompletionRequest),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-'
      }
    })

    // Log the response
    console.log('Response Status:', res.status)
    const text = await res.text()
    console.log('Response Body:', text)
  })
})
