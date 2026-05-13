// src/types/api.ts
// Consolidated API types - Chat Completions and Common schemas

import { z } from 'zod'

// ====================
// Common Enums
// ====================

export const RoleEnum = z.enum([
  'developer',
  'system',
  'user',
  'assistant',
  'tool',
  'function'
])
export type RoleEnum = z.infer<typeof RoleEnum>

export const FinishReasonEnum = z.enum([
  'stop',
  'length',
  'tool_calls',
  'content_filter',
  'function_call'
])
export type FinishReason = z.infer<typeof FinishReasonEnum>

export const DetailEnum = z.enum(['auto', 'low', 'high'])
export type Detail = z.infer<typeof DetailEnum>

export const ModalityEnum = z.enum(['text', 'audio'])
export type Modality = z.infer<typeof ModalityEnum>

export const ServiceTierEnum = z.enum([
  'auto',
  'default',
  'flex',
  'scale',
  'priority'
])
export type ServiceTier = z.infer<typeof ServiceTierEnum>

export const ReasoningEffortEnum = z.enum([
  'none',
  'low',
  'medium',
  'high',
  'max'
])
export type ReasoningEffort = z.infer<typeof ReasoningEffortEnum>

export const VerbosityEnum = z.enum(['low', 'medium', 'high'])
export type Verbosity = z.infer<typeof VerbosityEnum>

export const SearchContextSizeEnum = z.enum(['low', 'medium', 'high'])
export type SearchContextSize = z.infer<typeof SearchContextSizeEnum>

export const PromptCacheRetentionEnum = z.enum(['in_memory', '24h'])
export type PromptCacheRetention = z.infer<typeof PromptCacheRetentionEnum>

// Legacy Role enum for backward compatibility
export enum Role {
  SYSTEM = 'system',
  CONTEXT = 'context',
  USER = 'user',
  ASSISTANT = 'assistant',
  TOOL = 'tool'
}

// ====================
// Common Content Types
// ====================

export const ChatCompletionContentPartTextSchema = z.object({
  type: z.literal('text'),
  text: z.string()
})
export type ChatCompletionContentPartText = z.infer<
  typeof ChatCompletionContentPartTextSchema
>

export const FileContentPartSchema = z.object({
  type: z.literal('file'),
  file: z.object({
    file_data: z.string().optional(),
    file_id: z.string().optional(),
    filename: z.string().optional()
  })
})
export type FileContentPart = z.infer<typeof FileContentPartSchema>

export const ChatCompletionContentPartSchema = z.union([
  ChatCompletionContentPartTextSchema,
  FileContentPartSchema
])
export type ChatCompletionContentPart = z.infer<
  typeof ChatCompletionContentPartSchema
>

export const SimpleContentPartSchema = ChatCompletionContentPartTextSchema
export type SimpleContentPart = z.infer<typeof SimpleContentPartSchema>

export const ChatCompletionContentPartRefusalSchema = z.object({
  type: z.literal('refusal'),
  refusal: z.string()
})
export type ChatCompletionContentPartRefusal = z.infer<
  typeof ChatCompletionContentPartRefusalSchema
>

// ====================
// Common Usage Types
// ====================

export const CompletionUsageSchema = z.object({
  completion_tokens: z.number(),
  prompt_tokens: z.number(),
  total_tokens: z.number(),
  completion_tokens_details: z
    .object({
      accepted_prediction_tokens: z.number().optional(),
      audio_tokens: z.number().optional(),
      reasoning_tokens: z.number().optional(),
      rejected_prediction_tokens: z.number().optional()
    })
    .optional(),
  prompt_tokens_details: z
    .object({
      audio_tokens: z.number().optional(),
      cached_tokens: z.number().optional()
    })
    .optional()
})
export type CompletionUsage = z.infer<typeof CompletionUsageSchema>

// ====================
// Common Logprobs
// ====================

export const ChatCompletionTokenLogprobSchema = z.object({
  token: z.string(),
  bytes: z.array(z.number()).nullable(),
  logprob: z.number(),
  top_logprobs: z.array(
    z.object({
      token: z.string(),
      bytes: z.array(z.number()).nullable(),
      logprob: z.number()
    })
  )
})
export type ChatCompletionTokenLogprob = z.infer<
  typeof ChatCompletionTokenLogprobSchema
>

export const LogprobsSchema = z.object({
  content: z.array(ChatCompletionTokenLogprobSchema).optional(),
  refusal: z.array(ChatCompletionTokenLogprobSchema).optional()
})
export type Logprobs = z.infer<typeof LogprobsSchema>

// ====================
// Common Tool Types
// ====================

export const FunctionDefinitionSchema = z.object({
  name: z.string().max(64),
  description: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  strict: z.boolean().optional()
})
export type FunctionDefinition = z.infer<typeof FunctionDefinitionSchema>

export const ChatCompletionFunctionToolSchema = z.object({
  type: z.literal('function'),
  function: FunctionDefinitionSchema
})
export type ChatCompletionFunctionTool = z.infer<
  typeof ChatCompletionFunctionToolSchema
>

export const ToolChoiceModeEnum = z.enum(['none', 'auto', 'required'])
export type ToolChoiceMode = z.infer<typeof ToolChoiceModeEnum>

export const ChatCompletionToolChoiceOptionSchema = z.union([
  ToolChoiceModeEnum,
  z.object({
    type: z.literal('allowed_tools'),
    allowed_tools: z.object({
      mode: z.enum(['auto', 'required']),
      tools: z.array(z.record(z.string(), z.unknown()))
    })
  }),
  z.object({
    type: z.literal('function'),
    function: z.object({ name: z.string() })
  })
])
export type ChatCompletionToolChoiceOption = z.infer<
  typeof ChatCompletionToolChoiceOptionSchema
>

export const ChatCompletionToolSchema = z.union([
  ChatCompletionFunctionToolSchema,
  z.object({
    type: z.literal('custom'),
    custom: z.object({
      name: z.string(),
      description: z.string().optional(),
      format: z
        .union([
          z.object({ type: z.literal('text') }),
          z.object({
            type: z.literal('grammar'),
            grammar: z.object({
              definition: z.string(),
              syntax: z.enum(['lark', 'regex'])
            })
          })
        ])
        .optional()
    })
  })
])
export type ChatCompletionTool = z.infer<typeof ChatCompletionToolSchema>

// Legacy tool schema for backward compatibility
export const ToolCallSchema = z.object({
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    parameters: z.record(z.string(), z.unknown()),
    description: z.string()
  })
})

// ====================
// Common Response Format
// ====================

export const ResponseFormatTextSchema = z.object({
  type: z.literal('text')
})

export const ResponseFormatJSONSchemaSchema = z.object({
  type: z.literal('json_schema'),
  json_schema: z.object({
    name: z.string().max(64),
    description: z.string().optional(),
    schema: z.record(z.string(), z.unknown()).optional(),
    strict: z.boolean().optional()
  })
})

export const ResponseFormatJSONObjectSchema = z.object({
  type: z.literal('json_object')
})

export const ResponseFormatSchema = z.union([
  ResponseFormatTextSchema,
  ResponseFormatJSONSchemaSchema,
  ResponseFormatJSONObjectSchema
])
export type ResponseFormat = z.infer<typeof ResponseFormatSchema>

// ====================
// Common Stream Options
// ====================

export const ChatCompletionStreamOptionsSchema = z.object({
  include_obfuscation: z.boolean().optional(),
  include_usage: z.boolean().optional()
})
export type ChatCompletionStreamOptions = z.infer<
  typeof ChatCompletionStreamOptionsSchema
>

// ====================
// Common Web Search Options
// ====================

export const WebSearchOptionsSchema = z.object({
  search_context_size: SearchContextSizeEnum.optional(),
  user_location: z
    .object({
      type: z.literal('approximate'),
      approximate: z.object({
        city: z.string().optional(),
        country: z.string().optional(),
        region: z.string().optional(),
        timezone: z.string().optional()
      })
    })
    .optional()
})
export type WebSearchOptions = z.infer<typeof WebSearchOptionsSchema>

// ====================
// Common Error Types
// ====================

export const ErrorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
    code: z.string().optional(),
    param: z.string().optional()
  })
})
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

// ====================
// Common URL Citation
// ====================

export const UrlCitationAnnotationSchema = z.object({
  type: z.literal('url_citation'),
  url_citation: z.object({
    end_index: z.number(),
    start_index: z.number(),
    title: z.string(),
    url: z.string()
  })
})
export type UrlCitationAnnotation = z.infer<typeof UrlCitationAnnotationSchema>

export { UrlCitationAnnotationSchema as UrlCitationSchema }

// ====================
// Chat Completions API Types
// ====================

export const ChatCompletionPredictionContentSchema = z.object({
  type: z.literal('content'),
  content: z.union([z.string(), z.array(SimpleContentPartSchema)])
})
export type ChatCompletionPredictionContent = z.infer<
  typeof ChatCompletionPredictionContentSchema
>

// Message Types
export const ChatCompletionSystemMessageParamSchema = z.object({
  role: z.literal('system'),
  content: z.union([z.string(), z.array(SimpleContentPartSchema)]),
  name: z.string().optional()
})
export type ChatCompletionSystemMessageParam = z.infer<
  typeof ChatCompletionSystemMessageParamSchema
>

export const ChatCompletionUserMessageParamSchema = z.object({
  role: z.literal('user'),
  content: z.union([z.string(), z.array(ChatCompletionContentPartSchema)]),
  name: z.string().optional()
})
export type ChatCompletionUserMessageParam = z.infer<
  typeof ChatCompletionUserMessageParamSchema
>

export const ChatCompletionAssistantMessageParamSchema = z.object({
  role: z.literal('assistant'),
  content: z
    .union([
      z.string(),
      z.array(
        z.union([
          ChatCompletionContentPartTextSchema,
          ChatCompletionContentPartRefusalSchema
        ])
      )
    ])
    .optional(),
  function_call: z
    .object({ arguments: z.string(), name: z.string() })
    .optional(),
  name: z.string().optional(),
  refusal: z.string().optional(),
  tool_calls: z
    .array(
      z.union([
        z.object({
          id: z.string(),
          function: z.object({
            arguments: z.string(),
            name: z.string()
          }),
          type: z.literal('function')
        }),
        z.object({
          id: z.string(),
          custom: z.object({
            input: z.string(),
            name: z.string()
          }),
          type: z.literal('custom')
        })
      ])
    )
    .optional()
})
export type ChatCompletionAssistantMessageParam = z.infer<
  typeof ChatCompletionAssistantMessageParamSchema
>

export const ChatCompletionToolMessageParamSchema = z.object({
  role: z.literal('tool'),
  content: z.union([z.string(), z.array(SimpleContentPartSchema)]),
  tool_call_id: z.string()
})
export type ChatCompletionToolMessageParam = z.infer<
  typeof ChatCompletionToolMessageParamSchema
>

export const ChatCompletionFunctionMessageParamSchema = z.object({
  role: z.literal('function'),
  content: z.string(),
  name: z.string()
})
export type ChatCompletionFunctionMessageParam = z.infer<
  typeof ChatCompletionFunctionMessageParamSchema
>

export const ChatCompletionDeveloperMessageParamSchema = z.object({
  role: z.literal('developer'),
  content: z.union([z.string(), z.array(SimpleContentPartSchema)]),
  name: z.string().optional()
})
export type ChatCompletionDeveloperMessageParam = z.infer<
  typeof ChatCompletionDeveloperMessageParamSchema
>

export const ChatCompletionMessageParamSchema = z.union([
  ChatCompletionDeveloperMessageParamSchema,
  ChatCompletionSystemMessageParamSchema,
  ChatCompletionUserMessageParamSchema,
  ChatCompletionAssistantMessageParamSchema,
  ChatCompletionToolMessageParamSchema,
  ChatCompletionFunctionMessageParamSchema
])
export type ChatCompletionMessageParam = z.infer<
  typeof ChatCompletionMessageParamSchema
>

// Request
export const ChatCompletionRequestSchema = z.object({
  messages: z.array(ChatCompletionMessageParamSchema),
  model: z.string(),

  frequency_penalty: z.number().min(-2).max(2).optional(),
  function_call: z
    .union([z.enum(['none', 'auto']), z.object({ name: z.string() })])
    .optional(),
  functions: z
    .array(
      z.object({
        name: z.string().max(64),
        description: z.string().optional(),
        parameters: z.record(z.string(), z.unknown()).optional()
      })
    )
    .optional(),
  logit_bias: z.record(z.string(), z.number()).optional(),
  logprobs: z.boolean().optional(),
  max_completion_tokens: z.number().int().positive().optional(),
  max_tokens: z.number().int().positive().optional(),
  metadata: z.record(z.string().max(64), z.string().max(512)).optional(),
  modalities: z.array(ModalityEnum).optional(),
  n: z.number().int().positive().optional(),
  parallel_tool_calls: z.boolean().optional(),
  prediction: ChatCompletionPredictionContentSchema.optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  prompt_cache_key: z.string().optional(),
  prompt_cache_retention: PromptCacheRetentionEnum.optional(),
  reasoning_effort: ReasoningEffortEnum.optional(),
  response_format: ResponseFormatSchema.optional(),
  safety_identifier: z.string().max(64).optional(),
  seed: z.number().optional(),
  service_tier: ServiceTierEnum.optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  store: z.boolean().optional(),
  stream: z.boolean().optional(),
  stream_options: ChatCompletionStreamOptionsSchema.optional(),
  temperature: z.number().min(0).max(2).optional(),
  tool_choice: ChatCompletionToolChoiceOptionSchema.optional(),
  tools: z.array(ChatCompletionToolSchema).optional(),
  top_logprobs: z.number().int().min(0).max(20).optional(),
  top_p: z.number().min(0).max(1).optional(),
  user: z.string().optional(),
  verbosity: VerbosityEnum.optional(),
  web_search_options: WebSearchOptionsSchema.optional()
})
export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>

// Response Types
export const ChatCompletionMessageSchema = z.object({
  content: z.string().nullable(),
  refusal: z.string().nullable(),
  role: z.literal('assistant'),
  annotations: z.array(z.any()).optional(),

  function_call: z
    .object({ arguments: z.string(), name: z.string() })
    .optional(),
  tool_calls: z
    .array(
      z.union([
        z.object({
          id: z.string(),
          function: z.object({
            arguments: z.string(),
            name: z.string()
          }),
          type: z.literal('function')
        }),
        z.object({
          id: z.string(),
          custom: z.object({
            input: z.string(),
            name: z.string()
          }),
          type: z.literal('custom')
        })
      ])
    )
    .optional()
})
export type ChatCompletionMessage = z.infer<typeof ChatCompletionMessageSchema>

export const ChatCompletionChoiceSchema = z.object({
  finish_reason: FinishReasonEnum,
  index: z.number(),
  logprobs: LogprobsSchema.nullable(),
  message: ChatCompletionMessageSchema
})
export type ChatCompletionChoice = z.infer<typeof ChatCompletionChoiceSchema>

export const ChatCompletionResponseSchema = z.object({
  id: z.string(),
  choices: z.array(ChatCompletionChoiceSchema),
  created: z.number(),
  model: z.string(),
  object: z.literal('chat.completion'),
  service_tier: ServiceTierEnum.optional(),
  system_fingerprint: z.string().optional(),
  usage: CompletionUsageSchema.optional()
})
export type ChatCompletionResponse = z.infer<
  typeof ChatCompletionResponseSchema
>

// Streaming Chunk Types
export const ChatCompletionChunkDeltaSchema = z.object({
  role: RoleEnum.optional(),
  content: z.string().optional(),
  refusal: z.string().optional(),
  tool_calls: z
    .array(
      z.object({
        index: z.number(),
        id: z.string().optional(),
        type: z.literal('function').optional(),
        function: z.object({
          name: z.string().optional(),
          arguments: z.string().optional()
        })
      })
    )
    .optional()
})
export type ChatCompletionChunkDelta = z.infer<
  typeof ChatCompletionChunkDeltaSchema
>

export const ChatCompletionChunkChoiceSchema = z.object({
  index: z.number(),
  delta: ChatCompletionChunkDeltaSchema,
  logprobs: LogprobsSchema.nullable(),
  finish_reason: FinishReasonEnum.nullable()
})
export type ChatCompletionChunkChoice = z.infer<
  typeof ChatCompletionChunkChoiceSchema
>

export const ChatCompletionChunkSchema = z.object({
  id: z.string(),
  object: z.literal('chat.completion.chunk'),
  created: z.number(),
  model: z.string(),
  system_fingerprint: z.string().optional(),
  choices: z.array(ChatCompletionChunkChoiceSchema),
  usage: CompletionUsageSchema.optional()
})
export type ChatCompletionChunk = z.infer<typeof ChatCompletionChunkSchema>

// Parsed Chunk (for internal use)
export interface ParsedChunk {
  id: string
  model: string
  content: string
  isDone: boolean
  role?: string
  finish_reason?: string | null
  reasoning_content?: string
}

// Legacy StreamChunkSchema for backward compatibility
export const StreamChunkSchema = ChatCompletionChunkSchema
