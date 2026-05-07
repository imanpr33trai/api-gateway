import { z } from "zod";

// ============================================================================
// Chat Completion Schemas
// ============================================================================

/**
 * Message role
 */
export const MessageRoleSchema = z.enum(["system", "user", "assistant", "tool"]);

/**
 * Text content
 */
export const TextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

/**
 * Image URL content
 */
export const ImageURLContentSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.union([
    z.string(),
    z.object({
      url: z.string(),
      detail: z.enum(["low", "high", "auto"]).optional(),
    }),
  ]),
});

/**
 * Input audio content
 */
export const InputAudioContentSchema = z.object({
  type: z.literal("input_audio"),
  input_audio: z.object({
    data: z.string(), // base64
    format: z.string(),
  }),
});

/**
 * Content union
 */
export const ContentSchema = z.union([
  z.string(),
  z.array(z.union([TextContentSchema, ImageURLContentSchema, InputAudioContentSchema])),
]);

export type Content = z.infer<typeof ContentSchema>;

/**
 * Function definition
 */
export const FunctionDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
});

export type FunctionDefinition = z.infer<typeof FunctionDefinitionSchema>;

/**
 * Tool call
 */
export const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: FunctionDefinitionSchema.extend({
    arguments: z.string(), // JSON string
  }),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

/**
 * Chat message
 */
export const ChatMessageSchema = z.object({
  role: MessageRoleSchema,
  content: ContentSchema.optional(),
  name: z.string().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
  tool_call_id: z.string().optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/**
 * Reasoning effort
 */
export const ReasoningEffortSchema = z.object({
  effort: z.enum(["high", "medium", "low", "max", "none"]),
});

/**
 * Response format
 */
export const ResponseFormatSchema = z.object({
  type: z.enum(["text", "json_object", "json_schema"]),
  json_schema: z
    .object({
      name: z.string().optional(),
      description: z.string().optional(),
      schema: z.record(z.unknown()).optional(),
      strict: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Chat completion request
 */
export const ChatCompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(ChatMessageSchema),
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().positive().optional(),
  seed: z.number().int().optional(),
  tools: z
    .array(
      z.object({
        type: z.literal("function"),
        function: FunctionDefinitionSchema,
      })
    )
    .optional(),
  tool_choice: z
    .union([
      z.enum(["auto", "none", "required"]),
      z.object({
        type: z.literal("function"),
        function: z.object({
          name: z.string(),
        }),
      }),
    ])
    .optional(),
  reasoning: ReasoningEffortSchema.optional(),
  reasoning_effort: z.enum(["high", "medium", "low", "max", "none"]).optional(),
  response_format: ResponseFormatSchema.optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  logprobs: z.boolean().optional(),
  top_logprobs: z.number().int().min(0).max(20).optional(),
});

export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

/**
 * Chat completion choice
 */
export const ChatCompletionChoiceSchema = z.object({
  index: z.number().int(),
  message: ChatMessageSchema,
  finish_reason: z.enum(["stop", "length", "tool_calls", "content_filter", "null"]),
});

export type ChatCompletionChoice = z.infer<typeof ChatCompletionChoiceSchema>;

/**
 * Usage information
 */
export const UsageSchema = z.object({
  prompt_tokens: z.number().int(),
  completion_tokens: z.number().int(),
  total_tokens: z.number().int(),
  prompt_tokens_details: z
    .object({
      cached_tokens: z.number().int(),
    })
    .optional(),
  completion_tokens_details: z
    .object({
      reasoning_tokens: z.number().int(),
    })
    .optional(),
});

export type Usage = z.infer<typeof UsageSchema>;

/**
 * Chat completion response
 */
export const ChatCompletionResponseSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number().int(),
  model: z.string(),
  choices: z.array(ChatCompletionChoiceSchema),
  usage: UsageSchema,
});

export type ChatCompletionResponse = z.infer<typeof ChatCompletionResponseSchema>;

/**
 * Stream choice (for streaming responses)
 */
export const ChatCompletionStreamChoiceSchema = z.object({
  index: z.number().int(),
  delta: ChatMessageSchema.omit({ role: true }).partial(),
  finish_reason: z.enum(["stop", "length", "tool_calls", "content_filter", "null"]).nullable(),
});

export type ChatCompletionStreamChoice = z.infer<typeof ChatCompletionStreamChoiceSchema>;

/**
 * Stream response chunk
 */
export const ChatCompletionChunkSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion.chunk"),
  created: z.number().int(),
  model: z.string(),
  choices: z.array(ChatCompletionStreamChoiceSchema),
});

export type ChatCompletionChunk = z.infer<typeof ChatCompletionChunkSchema>;

// ============================================================================
// Validation Helper
// ============================================================================

export function validateChatCompletionRequest(
  data: unknown
): ChatCompletionRequest {
  return ChatCompletionRequestSchema.parse(data);
}

export function validateChatCompletionRequestSafe(
  data: unknown
): { success: true; data: ChatCompletionRequest } | { success: false; error: z.ZodError } {
  return ChatCompletionRequestSchema.safeParse(data);
}
