// src/services/chat.service.ts
import { Nvidia } from '../providers/nvidia'
import {
  ChatCompletionRequestSchema,
  type ChatCompletionRequest
} from '../providers/types'

/**
 * Non‑streaming chat completion.
 * Validates, calls Nvidia, parses & validates the JSON response.
 */
export async function chatCompletionService(
  req: ChatCompletionRequest
): Promise<Response> {
  const validated = ChatCompletionRequestSchema.parse(req)
  const response = await Nvidia.chat(validated)

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new Error(`Provider error ${response.status}: ${errorBody}`)
  }

  // const json = await response.json();
  return response
}

/**
 * Streaming chat completion.
 * Returns the raw provider Response (body is a ReadableStream).
 */
export async function chatCompletionStreamService(
  req: ChatCompletionRequest & { stream: true }
): Promise<Response> {
  const validated = ChatCompletionRequestSchema.parse(req)
  const response = await Nvidia.chat(validated)

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new Error(`Provider error ${response.status}: ${errorBody}`)
  }

  return response // raw stream
}

/**
 * Simplified generate – takes a prompt string and returns just the text content.
 * Non‑streaming only.
 */
export async function generateCompletionService(
  prompt: string,
  model = 'meta/llama3-8b-instruct'
): Promise<Response> {
  const request: ChatCompletionRequest = {
    model,
    messages: [{ role: 'user', content: prompt }]
  }

  const res = await chatCompletionService(request)

  return res
}
