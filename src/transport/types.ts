// ─── Stream Chunk ─────────────────────────────────────────────────

import z from 'zod'

/**
 * A single SSE stream chunk normalized across all transport modes.
 *
 * Discriminated union — narrow on `type` for type-safe field access:
 *
 * ```ts
 * if (chunk.type === "text") {
 *   console.log(chunk.content); // string ✓
 * }
 * if (chunk.type === "done") {
 *   console.log(chunk.finishReason); // string ✓
 * }
 * ```
 */
export type StreamChunk =
  | { type: 'text'; content: string }
  | { type: 'reasoning'; content: string }
  | {
      type: 'tool_call_start'
      id: string
      name: string
      index: number
    }
  | { type: 'tool_call_delta'; content: string; index: number }
  | {
      type: 'done'
      finishReason: string
      usage?: Usage | null
    }

// ─── SSE helpers ──────────────────────────────────────────────────

/**
 * Parse a raw SSE `data: {...}` line into a JSON value.
 * Returns null for keepalive comments or empty lines.
 */
export function parseSSELine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const json = trimmed.slice(5).trim()
  if (!json || json === '[DONE]') return null
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

export interface Usage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export interface ToolCall {
  id: string
  name: string
  arguments: string
  providerData?: Record<string, unknown>
}

export interface NormalizedResponse {
  content: string | null
  toolCalls: ToolCall[] | null
  finishReason: string
  reasoning?: string | null
  usage?: Usage | null
  providerData?: Record<string, unknown> | null
}

export enum Role {
  SYSTEM = 'system',
  CONTEXT = 'context',
  USER = 'user',
  ASSISTANT = 'assistant',
  TOOL = 'tool'
}

export const FinishReasonEnum = z.enum([
  'stop',
  'length',
  'tool_calls',
  'content_filter',
  'function_call'
])
export type FinishReason = z.infer<typeof FinishReasonEnum>

export const MessageSchema = z.object({
  role: z.enum(Role),
  content: z.string().or(
    z.array(
      z.object({
        type: z.enum(['text', 'image_url']),
        text: z.string().optional(),
        imageUrl: z
          .object({
            url: z.string(),
            detail: z.string().optional()
          })
          .optional()
      })
    )
  )
})

export const ChatCompletionRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(MessageSchema).min(1),
  temperature: z.number().optional(),
  maxTokens: z.number().int().positive().optional(),
  stream: z.boolean().default(false),
  reasoningConfig: z
    .object({
      enabled: z.boolean().default(true),
      effort: z
        .enum(['minimal', 'low', 'medium', 'high', 'xhigh'])
        .default('medium')
    })
    .optional(),
  providerPreferences: z.record(z.string(), z.unknown()).optional(),
  tools: z
    .array(
      z.object({
        type: z.enum(['function']).default('function'),
        function: z.object({
          name: z.string(),
          description: z.string().optional(),
          parameters: z.record(z.string(), z.unknown())
        })
      })
    )
    .optional()
})
export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>
export const AnthropicMessagesRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(MessageSchema).min(1),
  maxTokens: z.number().int().positive().default(16384),
  temperature: z.number().optional(),
  reasoningConfig: z
    .object({
      enabled: z.boolean().default(true),
      effort: z
        .enum(['minimal', 'low', 'medium', 'high', 'xhigh'])
        .default('medium')
    })
    .optional(),
  tools: z
    .array(
      z.object({
        type: z.enum(['function']).default('function'),
        function: z.object({
          name: z.string(),
          description: z.string().optional(),
          parameters: z.record(z.string(), z.unknown())
        })
      })
    )
    .optional()
})

export type AnthropicMessagesRequest = z.infer<
  typeof AnthropicMessagesRequestSchema
>

export const CodexResponsesRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(MessageSchema).min(1),
  instructions: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
  reasoningConfig: z
    .object({
      enabled: z.boolean().default(true),
      effort: z
        .enum(['minimal', 'low', 'medium', 'high', 'xhigh'])
        .default('medium')
    })
    .optional(),
  tools: z
    .array(
      z.object({
        type: z.enum(['function']).default('function'),
        function: z.object({
          name: z.string(),
          description: z.string().optional(),
          parameters: z.record(z.string(), z.unknown())
        })
      })
    )
    .optional(),
  stream: z.boolean().default(false)
})

export type CodexResponsesRequest = z.infer<typeof CodexResponsesRequestSchema>
