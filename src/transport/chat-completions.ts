/**
 * Chat Completions Transport
 *
 * Handles api_mode='chat_completions' — the default for OpenAI-compatible
 * providers (OpenRouter, Nous, NVIDIA, DeepSeek, etc.).
 *
 * Provider-specific quirks:
 * - OpenRouter: provider.preferences, reasoning in extra_body
 * - Gemini: thinking_config in extra_body
 * - Nous: tags in extra_body
 * - Qwen: vl_high_resolution_images, metadata top-level
 */

import { BaseTransport, registerTransport } from './base'
import type { NormalizedResponse, ToolCall } from './types'

export class ChatCompletionsTransport extends BaseTransport {
  readonly apiMode = 'chat_completions'

  convertMessages(
    messages: Record<string, unknown>[],
    _kwargs?: Record<string, unknown>
  ): Record<string, unknown>[] {
    // Messages are already in OpenAI format — strip internal fields
    return messages.map(msg => {
      const clean = { ...msg }
      // Remove codex-specific fields that OpenAI-compat providers reject
      delete clean.codex_reasoning_items
      delete clean.codex_message_items
      delete clean.call_id
      return clean
    })
  }

  convertTools(tools: Record<string, unknown>[]): Record<string, unknown>[] {
    // Tools are already in OpenAI format
    return tools.map(tool => {
      const toolObj = tool as Record<string, unknown>
      return {
        type: 'function',
        function: (toolObj.function as Record<string, unknown>) ?? toolObj
      }
    })
  }

  buildKwargs(
    model: string,
    messages: Record<string, unknown>[],
    tools?: Record<string, unknown>[],
    params?: Record<string, unknown>
  ): Record<string, unknown> {
    const convertedMessages = this.convertMessages(messages)
    const kwargs: Record<string, unknown> = {
      model,
      messages: convertedMessages
    }

    // Default max_tokens
    kwargs.max_tokens = params?.maxTokens ?? params?.max_tokens ?? 4096

    // Temperature
    if (params?.temperature !== undefined) {
      kwargs.temperature = params.temperature
    }

    // Tools
    if (tools && tools.length > 0) {
      kwargs.tools = this.convertTools(tools)
      kwargs.tool_choice = 'auto'
      kwargs.parallel_tool_calls = true
    }

    // Reasoning config
    const reasoningConfig = params?.reasoningConfig as
      | Record<string, unknown>
      | undefined
    if (reasoningConfig) {
      this._applyReasoning(
        kwargs,
        model,
        reasoningConfig,
        params as Record<string, unknown>
      )
    }

    // Provider-specific extra body
    const providerName = params?.provider as string | undefined
    const extraBody = this._buildExtraBody(
      model,
      providerName,
      params as Record<string, unknown>
    )
    if (Object.keys(extraBody).length > 0) {
      kwargs.extra_body = extraBody
    }

    // Provider-specific headers
    const provider = providerName ?? ''
    if (provider === 'openrouter' && params?.sessionId) {
      kwargs.extra_headers = {
        'x-grok-conv-id': params.sessionId as string
      }
    }

    return kwargs
  }

  /**
   * Apply reasoning configuration based on provider.
   */
  private _applyReasoning(
    kwargs: Record<string, unknown>,
    _model: string,
    reasoningConfig: Record<string, unknown>,
    params: Record<string, unknown>
  ): void {
    const provider = (params.provider as string) ?? ''
    const enabled = reasoningConfig.enabled !== false
    const effort = (reasoningConfig.effort as string) ?? 'medium'

    if (!enabled) return

    if (provider === 'openrouter') {
      // OpenRouter passes reasoning config in extra_body
      if (!kwargs.extra_body) kwargs.extra_body = {}
      ;(kwargs.extra_body as Record<string, unknown>).reasoning = {
        enabled: true,
        effort
      }
    } else if (provider === 'nous') {
      if (!kwargs.extra_body) kwargs.extra_body = {}
      ;(kwargs.extra_body as Record<string, unknown>).reasoning = {
        enabled: true,
        effort
      }
    }
    // Gemini handles thinkingConfig separately in _buildExtraBody
  }

  /**
   * Build provider-specific extra_body.
   */
  private _buildExtraBody(
    model: string,
    providerName: string | undefined,
    params: Record<string, unknown>
  ): Record<string, unknown> {
    const extra: Record<string, unknown> = {}
    const provider = providerName ?? ''

    switch (provider) {
      case 'openrouter': {
        // Provider preferences
        const prefs = params.providerPreferences
        if (prefs) {
          extra.provider = prefs
        }

        // Reasoning is already applied in _applyReasoning
        break
      }

      case 'nous': {
        // Nous Portal product tags
        extra.tags = {
          source: 'ts-provider-oauth',
          version: '0.1.0'
        }
        break
      }

      case 'qwen':
      case 'qwen-oauth': {
        extra.vl_high_resolution_images = true
        break
      }

      case 'gemini':
      case 'google-gemini-cli': {
        const reasoningConfig = params.reasoningConfig as
          | Record<string, unknown>
          | undefined
        if (reasoningConfig && reasoningConfig.enabled !== false) {
          const effort = (reasoningConfig.effort as string) ?? 'medium'
          const normalizedModel = model.toLowerCase()
          if (normalizedModel.startsWith('gemini')) {
            const thinkingConfig: Record<string, unknown> = {
              includeThoughts: true
            }

            if (normalizedModel.startsWith('gemini-2.5-')) {
              // Gemini 2.5 accepts thinkingBudget
              extra.thinking_config = thinkingConfig
            } else if (
              normalizedModel.startsWith('gemini-3-') ||
              normalizedModel.startsWith('gemini-3.1-')
            ) {
              if (effort === 'high' || effort === 'xhigh') {
                thinkingConfig.thinkingLevel = 'high'
              } else if (effort === 'low' || effort === 'minimal') {
                thinkingConfig.thinkingLevel = 'low'
              } else {
                thinkingConfig.thinkingLevel = 'medium'
              }
              extra.thinking_config = thinkingConfig
            }
          }
        }
        break
      }
    }

    return extra
  }

  normalizeResponse(
    response: unknown,
    _kwargs?: Record<string, unknown>
  ): NormalizedResponse {
    const raw = response as Record<string, unknown>
    const choices = raw.choices as Record<string, unknown>[] | undefined

    if (!choices || choices.length === 0) {
      const firstChoice = (
        raw.choices as Record<string, unknown>[] | undefined
      )?.[0]
      return {
        content:
          ((firstChoice?.message as Record<string, unknown> | undefined)
            ?.content as string) ?? null,
        toolCalls: null,
        finishReason: 'stop',
        reasoning: null,
        usage: this._extractUsage(raw),
        providerData: null
      }
    }

    const choice = choices[0]!
    const message = choice.message as Record<string, unknown> | undefined

    if (!message) {
      return {
        content: (choice.text as string) ?? '',
        toolCalls: null,
        finishReason: String(choice.finish_reason ?? 'stop'),
        reasoning: null,
        usage: this._extractUsage(raw),
        providerData: null
      }
    }

    const content = (message.content as string | null) ?? null
    const messageRecord = message as Record<string, unknown>
    const assistantReasoning =
      (messageRecord.reasoning as string | null) ?? null
    const rawToolCalls = message.tool_calls as
      | Record<string, unknown>[]
      | undefined
    const finishReason = String(choice.finish_reason ?? 'stop')

    let toolCalls: ToolCall[] | null = null
    if (rawToolCalls && rawToolCalls.length > 0) {
      toolCalls = rawToolCalls.map(tc => ({
        id: String(tc.id ?? ''),
        name: String(
          (tc.function as Record<string, unknown> | undefined)?.name ?? ''
        ),
        arguements: String(
          (tc.function as Record<string, unknown> | undefined)?.arguements ??
            '{}'
        ),
        providerData: tc as Record<string, unknown>
      }))
    }

    return {
      content,
      toolCalls,
      finishReason,
      reasoning: assistantReasoning,
      usage: this._extractUsage(raw),
      providerData: null
    }
  }

  private _extractUsage(raw: Record<string, unknown>): {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  } | null {
    const usage = raw.usage as Record<string, unknown> | undefined
    if (!usage) return null
    return {
      promptTokens: (usage.prompt_tokens as number) ?? 0,
      completionTokens: (usage.completion_tokens as number) ?? 0,
      totalTokens: (usage.total_tokens as number) ?? 0
    }
  }

  override validateResponse(response: unknown): boolean {
    const raw = response as Record<string, unknown>
    return raw.choices !== undefined
  }

  override mapFinishReason(rawReason: string): string {
    const map: Record<string, string> = {
      stop: 'stop',
      length: 'length',
      tool_calls: 'tool_calls',
      content_filter: 'content_filter',
      function_call: 'tool_calls'
    }
    return map[rawReason] ?? rawReason
  }

  normalizeStreamChunk(
    chunk: Record<string, unknown>
  ): import('./types').StreamChunk | null {
    return normalizeChatCompletionsChunk(chunk)
  }
}

// Auto-register
registerTransport('chat_completions', ChatCompletionsTransport)

/**
 * Normalize a single SSE `data: {...}` chunk for chat completions streaming.
 *
 * OpenAI SSE format (simplified):
 *   data: {"choices":[{"delta":{"content":"Hello"},"index":0}]}
 *   data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_...","function":{"name":"get_weather","arguments":""}}]},"index":0}]}
 *   data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"loc\":\"}"}}]},"index":0}]}
 *   data: [DONE]
 */
export function normalizeChatCompletionsChunk(
  chunk: Record<string, unknown>
): import('./types').StreamChunk | null {
  const choices = chunk.choices as Record<string, unknown>[] | undefined
  if (!choices || choices.length === 0) return null

  const choice = choices[0]!
  const delta = choice.delta as Record<string, unknown> | undefined
  if (!delta) {
    // Finish signal: check finish_reason
    const finishReason = choice.finish_reason as string | undefined
    if (finishReason) {
      return {
        type: 'done',
        finishReason:
          finishReason === 'stop'
            ? 'stop'
            : finishReason === 'tool_calls'
              ? 'tool_calls'
              : finishReason === 'length'
                ? 'length'
                : finishReason,
        usage: chunk.usage
          ? {
              promptTokens:
                (chunk.usage as Record<string, number>).prompt_tokens ?? 0,
              completionTokens:
                (chunk.usage as Record<string, number>).completion_tokens ?? 0,
              totalTokens:
                (chunk.usage as Record<string, number>).total_tokens ?? 0
            }
          : null
      }
    }
    return null
  }

  // Content delta
  const content = delta.content as string | undefined
  if (content) {
    return { type: 'text', content }
  }

  // Reasoning delta (non-standard extension: used by OpenRouter, Nous, Gemini)
  const reasoning = delta.reasoning as string | undefined
  if (reasoning) {
    return { type: 'reasoning', content: reasoning }
  }

  // Tool call deltas
  const toolCalls = delta.tool_calls as Record<string, unknown>[] | undefined
  if (toolCalls && toolCalls.length > 0) {
    const tc = toolCalls[0]!
    const index = tc.index as number
    const id = tc.id as string | undefined
    const func = tc.function as Record<string, unknown> | undefined

    if (id && func?.name) {
      // Tool call start
      return {
        type: 'tool_call_start',
        id,
        name: func.name as string,
        index
      }
    }

    if (func?.arguments) {
      return {
        type: 'tool_call_delta',
        content: func.arguments as string,
        index
      }
    }
  }

  return null
}
