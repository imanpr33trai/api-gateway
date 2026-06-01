/**
 * Abstract transport base — mirrors Hermes' ProviderTransport ABC.
 *
 * Each transport owns the format conversion and response normalization
 * for one api_mode. It does NOT own HTTP calls, credential refresh,
 * or streaming.
 */

import type { NormalizedResponse, StreamChunk, ToolCall, Usage } from './types'

/**
 * Abstract transport that normalizes messages, tools, and responses
 * for a specific API mode.
 */
export abstract class BaseTransport {
  abstract readonly apiMode: string

  /**
   * Convert OpenAI-format messages to provider-native format.
   */
  abstract convertMessages(
    messages: Record<string, unknown>[],
    kwargs?: Record<string, unknown>
  ): unknown

  /**
   * Convert OpenAI-format tool definitions to provider-native format.
   */
  abstract convertTools(tools: Record<string, unknown>[]): unknown

  /**
   * Build the complete API call kwargs dict.
   */
  abstract buildKwargs(
    model: string,
    messages: Record<string, unknown>[],
    tools?: Record<string, unknown>[],
    params?: Record<string, unknown>
  ): Record<string, unknown>

  /**
   * Normalize a raw provider response to NormalizedResponse.
   */
  abstract normalizeResponse(
    response: unknown,
    kwargs?: Record<string, unknown>
  ): NormalizedResponse

  /**
   * Normalize a single SSE chunk (parsed JSON) to StreamChunk for frontend SSE.
   * Called once per `data: {...}` line in the stream.
   *
   * Returns null for keepalive/done signals that shouldn't be forwarded.
   * Returns a StreamChunk for text deltas, reasoning deltas, tool call
   * starts/deltas, or the final done signal.
   */
  abstract normalizeStreamChunk(
    chunk: Record<string, unknown>
  ): StreamChunk | null

  /**
   * Optional: validate the raw response structure.
   */
  validateResponse(_response: unknown): boolean {
    return true
  }

  /**
   * Optional: extract cache stats from response.
   */
  extractCacheStats(
    _response: unknown
  ): { cachedTokens: number; creationTokens: number } | null {
    return null
  }

  /**
   * Optional: map provider-specific finish reason to OpenAI equivalent.
   */
  mapFinishReason(rawReason: string): string {
    return rawReason
  }

  /**
   * Build a simple NormalizedResponse from text content.
   */
  protected textResponse(
    content: string,
    usage?: Usage | null
  ): NormalizedResponse {
    return {
      content,
      toolCalls: null,
      finishReason: 'stop',
      reasoning: null,
      usage: usage ?? null,
      providerData: null
    }
  }

  /**
   * Build a NormalizedResponse from tool calls.
   */
  protected toolCallsResponse(
    toolCalls: ToolCall[],
    reasoning?: string | null,
    usage?: Usage | null
  ): NormalizedResponse {
    return {
      content: null,
      toolCalls,
      finishReason: 'tool_calls',
      reasoning: reasoning ?? null,
      usage: usage ?? null,
      providerData: null
    }
  }
}

/**
 * Transport registry — maps api_mode to transport class.
 */
const _transportRegistry = new Map<string, new () => BaseTransport>()

export function registerTransport(
  apiMode: string,
  transportClass: new () => BaseTransport
): void {
  _transportRegistry.set(apiMode, transportClass)
}

export function getTransport(apiMode: string): BaseTransport | null {
  const cls = _transportRegistry.get(apiMode)
  if (!cls) return null
  return new cls()
}

export function listTransportModes(): string[] {
  return Array.from(_transportRegistry.keys())
}
