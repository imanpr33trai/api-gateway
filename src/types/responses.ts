// src/types/responses.ts
// Responses API types - OpenAI compatible /v1/responses endpoint

import { z } from 'zod'

import type {
  ServiceTier,
  PromptCacheRetention,
  Verbosity,
  ReasoningEffort
} from './common'
import {
  ServiceTierEnum,
  PromptCacheRetentionEnum,
  VerbosityEnum,
  ReasoningEffortEnum,
  ResponseUsageSchema
} from './common'

// ====================
// Enums (Responses-specific)
// ====================

export const ContentTypeEnum = z.enum([
  'input_text',
  'input_image',
  'output_text',
  'input_file'
])
export type ContentType = z.infer<typeof ContentTypeEnum>

export const InputItemTypeEnum = z.enum([
  'message',
  'function_call',
  'function_call_output',
  'reasoning'
])
export type InputItemType = z.infer<typeof InputItemTypeEnum>

export const OutputItemTypeEnum = z.enum([
  'message',
  'function_call',
  'reasoning'
])
export type OutputItemType = z.infer<typeof OutputItemTypeEnum>

export const SummaryTypeEnum = z.enum(['auto', 'concise', 'detailed'])
export type SummaryType = z.infer<typeof SummaryTypeEnum>

export const TextFormatTypeEnum = z.enum(['text', 'json_schema', 'json_object'])
export type TextFormatType = z.infer<typeof TextFormatTypeEnum>

export const TruncationEnum = z.enum(['auto', 'disabled'])
export type Truncation = z.infer<typeof TruncationEnum>

export const ResponseStatusEnum = z.enum([
  'completed',
  'failed',
  'in_progress',
  'cancelled',
  'queued',
  'incomplete'
])
export type ResponseStatus = z.infer<typeof ResponseStatusEnum>

export const ItemStatusEnum = z.enum(['in_progress', 'completed', 'incomplete'])
export type ItemStatus = z.infer<typeof ItemStatusEnum>

// ====================
// Content Parts
// ====================

export const ResponsesTextContentSchema = z.object({
  type: z.literal('input_text'),
  text: z.string()
})
export type ResponsesTextContent = z.infer<typeof ResponsesTextContentSchema>

export const ResponsesImageContentSchema = z.object({
  type: z.literal('input_image'),
  detail: z.string(),
  file_id: z.string().optional(),
  image_url: z.string().optional()
})
export type ResponsesImageContent = z.infer<typeof ResponsesImageContentSchema>

export const ResponsesOutputTextContentSchema = z.object({
  type: z.literal('output_text'),
  text: z.string()
})
export type ResponsesOutputTextContent = z.infer<
  typeof ResponsesOutputTextContentSchema
>

export const ResponsesFileContentSchema = z.object({
  type: z.literal('input_file'),
  file_data: z.string().optional(),
  file_id: z.string().optional(),
  file_url: z.string().optional(),
  filename: z.string().optional()
})
export type ResponsesFileContent = z.infer<typeof ResponsesFileContentSchema>

export const ResponsesContentSchema = z.discriminatedUnion('type', [
  ResponsesTextContentSchema,
  ResponsesImageContentSchema,
  ResponsesOutputTextContentSchema,
  ResponsesFileContentSchema
])
export type ResponsesContent = z.infer<typeof ResponsesContentSchema>

// ====================
// Input Items
// ====================

export const ResponsesInputMessageSchema = z.object({
  type: z.literal('message'),
  role: z.enum(['user', 'assistant', 'system', 'developer']),
  content: z.union([z.string(), z.array(ResponsesContentSchema)]).optional()
})
export type ResponsesInputMessage = z.infer<typeof ResponsesInputMessageSchema>

export const ResponsesFunctionCallSchema = z.object({
  id: z.string().optional(),
  type: z.literal('function_call'),
  call_id: z.string(),
  name: z.string(),
  arguments: z.string()
})
export type ResponsesFunctionCall = z.infer<typeof ResponsesFunctionCallSchema>

export const ResponsesFunctionCallOutputSchema = z.object({
  type: z.literal('function_call_output'),
  call_id: z.string(),
  output: z.string()
})
export type ResponsesFunctionCallOutput = z.infer<
  typeof ResponsesFunctionCallOutputSchema
>

export const ResponsesReasoningSummarySchema = z.object({
  type: z.literal('summary_text'),
  text: z.string()
})

export const ResponsesReasoningInputSchema = z.object({
  id: z.string().optional(),
  type: z.literal('reasoning'),
  summary: z.array(ResponsesReasoningSummarySchema).optional(),
  encrypted_content: z.string().optional()
})
export type ResponsesReasoningInput = z.infer<
  typeof ResponsesReasoningInputSchema
>

export const ResponsesInputItemSchema = z.discriminatedUnion('type', [
  ResponsesInputMessageSchema,
  ResponsesFunctionCallSchema,
  ResponsesFunctionCallOutputSchema,
  ResponsesReasoningInputSchema
])
export type ResponsesInputItem = z.infer<typeof ResponsesInputItemSchema>

// ====================
// Configuration Objects
// ====================

export const ResponsesReasoningSchema = z.object({
  effort: ReasoningEffortEnum.optional(),
  generate_summary: z.enum(['auto', 'concise', 'detailed']).optional(),
  summary: z.enum(['auto', 'concise', 'detailed']).optional()
})
export type ResponsesReasoning = z.infer<typeof ResponsesReasoningSchema>

export const ResponsesTextFormatSchema = z.object({
  type: TextFormatTypeEnum,
  name: z.string().optional(),
  schema: z.record(z.string(), z.unknown()).optional(),
  strict: z.boolean().optional()
})
export type ResponsesTextFormat = z.infer<typeof ResponsesTextFormatSchema>

export const ResponsesToolSchema = z.object({
  type: z.string(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  strict: z.boolean().nullable().optional(),
  parameters: z.record(z.string(), z.unknown()).nullable().optional()
})
export type ResponsesTool = z.infer<typeof ResponsesToolSchema>

// ====================
// Request
// ====================

export const ResponsesRequestSchema = z.object({
  model: z.string(),
  background: z.boolean().optional(),
  context_management: z
    .array(
      z.object({
        type: z.string(),
        compact_threshold: z.number().optional()
      })
    )
    .optional(),
  conversation: z.union([z.string(), z.object({ id: z.string() })]).optional(),
  include: z.array(z.string()).optional(),
  input: z.union([z.string(), z.array(ResponsesInputItemSchema)]),
  instructions: z.string().optional(),
  max_output_tokens: z.number().optional(),
  max_tool_calls: z.number().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  parallel_tool_calls: z.boolean().optional(),
  previous_response_id: z.string().optional(),
  prompt: z
    .object({
      id: z.string(),
      variables: z
        .record(z.string(), z.union([z.string(), z.unknown()]))
        .optional(),
      version: z.string().optional()
    })
    .optional(),
  prompt_cache_key: z.string().optional(),
  prompt_cache_retention: PromptCacheRetentionEnum.optional(),
  reasoning: ResponsesReasoningSchema.optional().nullable(),
  safety_identifier: z.string().optional(),
  service_tier: ServiceTierEnum.optional(),
  store: z.boolean().optional(),
  stream: z.boolean().optional(),
  stream_options: z
    .object({
      include_obfuscation: z.boolean().optional()
    })
    .optional(),
  temperature: z.number().optional(),
  text: z
    .object({
      format: ResponsesTextFormatSchema.optional(),
      verbosity: VerbosityEnum.optional()
    })
    .optional(),
  tool_choice: z
    .union([
      z.enum(['none', 'auto', 'required']),
      z.object({
        type: z.literal('allowed_tools'),
        mode: z.enum(['auto', 'required']),
        tools: z.array(z.record(z.string(), z.unknown()))
      }),
      z.object({
        type: z.literal('function'),
        name: z.string()
      })
    ])
    .optional(),
  tools: z.array(ResponsesToolSchema).optional(),
  top_logprobs: z.number().optional(),
  top_p: z.number().optional(),
  truncation: TruncationEnum.optional(),
  user: z.string().optional()
})
export type ResponsesRequest = z.infer<typeof ResponsesRequestSchema>

// ====================
// Response
// ====================

export const ResponsesErrorSchema = z.object({
  code: z.enum([
    'server_error',
    'rate_limit_exceeded',
    'invalid_prompt',
    'vector_store_timeout',
    'invalid_image',
    'invalid_image_format',
    'invalid_base64_image',
    'invalid_image_url',
    'image_too_large',
    'image_too_small',
    'image_parse_error',
    'image_content_policy_violation',
    'invalid_image_mode',
    'image_file_too_large',
    'unsupported_image_media_type',
    'empty_image_file',
    'failed_to_download_image',
    'image_file_not_found'
  ]),
  message: z.string()
})
export type ResponsesError = z.infer<typeof ResponsesErrorSchema>

export const ResponsesIncompleteDetailsSchema = z.object({
  reason: z.enum(['max_output_tokens', 'content_filter'])
})
export type ResponsesIncompleteDetails = z.infer<
  typeof ResponsesIncompleteDetailsSchema
>

export const ResponsesOutputContentSchema = z.object({
  type: z.literal('output_text'),
  text: z.string(),
  annotations: z.array(z.unknown()),
  logprobs: z.array(z.unknown())
})
export type ResponsesOutputContent = z.infer<
  typeof ResponsesOutputContentSchema
>

export const ResponsesOutputItemSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('message'),
    status: z.enum(['completed', 'in_progress']).optional(),
    role: z.literal('assistant'),
    content: z.array(ResponsesOutputContentSchema)
  }),
  z.object({
    id: z.string(),
    type: z.literal('function_call'),
    status: z.enum(['completed', 'in_progress']).optional(),
    call_id: z.string(),
    name: z.string(),
    arguments: z.string()
  }),
  z.object({
    id: z.string(),
    type: z.literal('reasoning'),
    summary: z.array(ResponsesReasoningSummarySchema).optional(),
    encrypted_content: z.string().optional()
  })
])
export type ResponsesOutputItem = z.infer<typeof ResponsesOutputItemSchema>

export const ResponsesUsageSchema = ResponseUsageSchema
export type ResponsesUsage = z.infer<typeof ResponsesUsageSchema>

export const ResponsesReasoningOutputSchema = z.object({
  effort: ReasoningEffortEnum.optional(),
  summary: z.enum(['auto', 'concise', 'detailed']).optional()
})
export type ResponsesReasoningOutput = z.infer<
  typeof ResponsesReasoningOutputSchema
>

export const ResponsesResponseSchema = z.object({
  id: z.string(),
  object: z.literal('response'),
  created_at: z.number(),
  completed_at: z.number().optional().nullable(),
  status: ResponseStatusEnum.optional(),
  incomplete_details: ResponsesIncompleteDetailsSchema.optional().nullable(),
  instructions: z
    .union([z.string(), z.array(ResponsesInputItemSchema)])
    .optional()
    .nullable(),
  metadata: z.record(z.string(), z.string()).optional().nullable(),
  model: z.string(),
  output: z.array(ResponsesOutputItemSchema).optional(),
  parallel_tool_calls: z.boolean().optional(),
  temperature: z.number().optional(),
  tool_choice: z
    .union([
      z.enum(['none', 'auto', 'required']),
      z.object({
        type: z.literal('allowed_tools'),
        mode: z.enum(['auto', 'required']).optional(),
        tools: z.array(z.record(z.string(), z.unknown())).optional()
      }),
      z.object({
        type: z.literal('function'),
        name: z.string()
      })
    ])
    .optional()
    .nullable(),
  tools: z.array(ResponsesToolSchema).optional(),
  top_p: z.number().optional(),
  background: z.boolean().optional().nullable(),
  conversation: z.object({ id: z.string() }).optional().nullable(),
  max_output_tokens: z.number().optional().nullable(),
  max_tool_calls: z.number().optional().nullable(),
  output_text: z.string().optional().nullable(),
  previous_response_id: z.string().optional().nullable(),
  prompt: z
    .object({
      id: z.string(),
      variables: z.record(z.string(), z.unknown()).optional(),
      version: z.string().optional()
    })
    .optional()
    .nullable(),
  prompt_cache_key: z.string().optional().nullable(),
  prompt_cache_retention: PromptCacheRetentionEnum.optional().nullable(),
  reasoning: ResponsesReasoningOutputSchema.optional().nullable(),
  safety_identifier: z.string().optional().nullable(),
  service_tier: ServiceTierEnum.optional().nullable(),
  text: z
    .object({
      format: ResponsesTextFormatSchema.optional(),
      verbosity: VerbosityEnum.optional()
    })
    .optional()
    .nullable(),
  top_logprobs: z.number().optional().nullable(),
  truncation: TruncationEnum.optional().nullable(),
  usage: ResponsesUsageSchema.optional().nullable(),
  user: z.string().optional().nullable(),
  error: ResponsesErrorSchema.optional().nullable()
})
export type ResponsesResponse = z.infer<typeof ResponsesResponseSchema>

// ====================
// Streaming Events
// ====================

export const ResponsesStreamEventTypeEnum = z.enum([
  'response.created',
  'response.in_progress',
  'response.completed',
  'response.output_item.added',
  'response.output_item.done',
  'response.content_part.added',
  'response.content_part.done',
  'response.output_text.delta',
  'response.output_text.done',
  'response.function_call_arguments.delta',
  'response.function_call_arguments.done',
  'response.reasoning_summary_text.delta',
  'response.reasoning_summary_text.done'
])
export type ResponsesStreamEventType = z.infer<
  typeof ResponsesStreamEventTypeEnum
>

export const ResponsesStreamEventSchema = z.object({
  event: ResponsesStreamEventTypeEnum,
  data: z.record(z.string(), z.unknown())
})
export type ResponsesStreamEvent = z.infer<typeof ResponsesStreamEventSchema>

// Re-export common types
export type { ServiceTier, PromptCacheRetention, Verbosity, ReasoningEffort }
