import { z } from "zod";

// ============================================================================
// Content Types
// ============================================================================

/**
 * Text content for input
 * @example { "type": "input_text", "text": "Hello, how are you?" }
 */
export const ResponsesTextContentSchema = z.object({
  type: z.literal("input_text"),
  text: z.string(),
});

export type ResponsesTextContent = z.infer<typeof ResponsesTextContentSchema>;

/**
 * Image content for input
 * @example { "type": "input_image", "detail": "high", "image_url": "data:image/png;base64,..." }
 */
export const ResponsesImageContentSchema = z.object({
  type: z.literal("input_image"),
  detail: z.string().optional(),
  file_id: z.string().optional(),
  image_url: z.string().optional(),
});

export type ResponsesImageContent = z.infer<typeof ResponsesImageContentSchema>;

/**
 * Output text from previous assistant response (conversation history)
 */
export const ResponsesOutputTextContentSchema = z.object({
  type: z.literal("output_text"),
  text: z.string(),
});

export type ResponsesOutputTextContent = z.infer<typeof ResponsesOutputTextContentSchema>;

/**
 * File content for input
 */
export const ResponsesFileContentSchema = z.object({
  type: z.literal("input_file"),
  file_data: z.string().optional(),
  file_id: z.string().optional(),
  file_url: z.string().optional(),
  filename: z.string().optional(),
});

export type ResponsesFileContent = z.infer<typeof ResponsesFileContentSchema>;

/**
 * Union of all content types
 */
export const ResponsesContentSchema: z.ZodType<
  ResponsesTextContent | ResponsesImageContent | ResponsesOutputTextContent | ResponsesFileContent
> = z.discriminatedUnion("type", [
  ResponsesTextContentSchema,
  ResponsesImageContentSchema,
  ResponsesOutputTextContentSchema,
  ResponsesFileContentSchema,
]);

export type ResponsesContent = z.infer<typeof ResponsesContentSchema>;

// ============================================================================
// Input Message
// ============================================================================

/**
 * Input message item
 * @example { "type": "message", "role": "user", "content": "Hello" }
 */
export const ResponsesInputMessageSchema = z.object({
  type: z.literal("message"),
  role: z.enum(["user", "system", "developer"]),
  content: z
    .union([z.string(), z.array(ResponsesContentSchema)])
    .optional()
    .default([]),
});

export type ResponsesInputMessage = z.infer<typeof ResponsesInputMessageSchema>;

// ============================================================================
// Function Call
// ============================================================================

/**
 * Assistant's function call in conversation history
 * @example { "type": "function_call", "call_id": "call_abc123", "name": "get_weather", "arguments": "{\"city\": \"NYC\"}" }
 */
export const ResponsesFunctionCallSchema = z.object({
  id: z.string().optional(),
  type: z.literal("function_call"),
  call_id: z.string(),
  name: z.string(),
  arguments: z.string(),
});

export type ResponsesFunctionCall = z.infer<typeof ResponsesFunctionCallSchema>;

/**
 * Function call result from client
 * @example { "type": "function_call_output", "call_id": "call_abc123", "output": "Sunny, 72F" }
 */
export const ResponsesFunctionCallOutputSchema = z.object({
  type: z.literal("function_call_output"),
  call_id: z.string(),
  output: z.union([z.string(), z.array(ResponsesContentSchema)]),
});

export type ResponsesFunctionCallOutput = z.infer<typeof ResponsesFunctionCallOutputSchema>;

// ============================================================================
// Reasoning
// ============================================================================

/**
 * Reasoning summary
 */
export const ResponsesReasoningSummarySchema = z.object({
  type: z.literal("summary_text"),
  text: z.string(),
});

export type ResponsesReasoningSummary = z.infer<typeof ResponsesReasoningSummarySchema>;

/**
 * Reasoning input (passed back from previous response)
 */
export const ResponsesReasoningInputSchema = z.object({
  id: z.string().optional(),
  type: z.literal("reasoning"),
  summary: z.array(ResponsesReasoningSummarySchema).optional(),
  encrypted_content: z.string().optional(),
});

export type ResponsesReasoningInput = z.infer<typeof ResponsesReasoningInputSchema>;

// ============================================================================
// Input Item Union
// ============================================================================

/**
 * Union of all input item types
 */
export const ResponsesInputItemSchema: z.ZodType<
  ResponsesInputMessage | ResponsesFunctionCall | ResponsesFunctionCallOutput | ResponsesReasoningInput
> = z.discriminatedUnion("type", [
  ResponsesInputMessageSchema,
  ResponsesFunctionCallSchema,
  ResponsesFunctionCallOutputSchema,
  ResponsesReasoningInputSchema,
]);

export type ResponsesInputItem = z.infer<typeof ResponsesInputItemSchema>;

// ============================================================================
// Input (can be string or array of items)
// ============================================================================

/**
 * Input can be a simple string or array of input items
 * @example "Hello" or [{"type": "message", "role": "user", "content": "Hello"}]
 */
export const ResponsesInputSchema = z
  .union([z.string(), z.array(ResponsesInputItemSchema)])
  .transform((val) => {
    if (typeof val === "string") {
      return { text: val, items: [] };
    }
    return { text: "", items: val };
  });

export type ResponsesInput = z.infer<typeof ResponsesInputSchema>;

// ============================================================================
// Text Format
// ============================================================================

/**
 * Text format for response output (JSON mode, etc.)
 */
export const ResponsesTextFormatSchema = z.object({
  type: z.enum(["text", "json_schema"]).default("text"),
  name: z.string().optional(),
  schema: z.record(z.unknown()).optional(),
  strict: z.boolean().optional(),
});

export type ResponsesTextFormat = z.infer<typeof ResponsesTextFormatSchema>;

/**
 * Text configuration
 */
export const ResponsesTextSchema = z.object({
  format: ResponsesTextFormatSchema.optional(),
});

export type ResponsesText = z.infer<typeof ResponsesTextSchema>;

// ============================================================================
// Reasoning Configuration
// ============================================================================

/**
 * Reasoning configuration (for thinking models)
 */
export const ResponsesReasoningSchema = z.object({
  effort: z
    .enum(["high", "medium", "low", "max", "none"])
    .optional()
    .default("medium"),
  generate_summary: z.enum(["auto", "concise", "detailed"]).optional(),
  summary: z.enum(["auto", "concise", "detailed"]).optional(),
});

export type ResponsesReasoning = z.infer<typeof ResponsesReasoningSchema>;

// ============================================================================
// Tools
// ============================================================================

/**
 * Tool definition in Responses API format
 * @example
 * {
 *   "type": "function",
 *   "name": "get_weather",
 *   "description": "Get weather for a location",
 *   "strict": true,
 *   "parameters": { ... }
 * }
 */
export const ResponsesToolSchema = z.object({
  type: z.literal("function"),
  name: z.string(),
  description: z.string().nullable(),
  strict: z.boolean().nullable(),
  parameters: z.record(z.unknown()).nullable(),
});

export type ResponsesTool = z.infer<typeof ResponsesToolSchema>;

// ============================================================================
// Request
// ============================================================================

/**
 * Complete Responses API request
 * POST /v1/responses
 */
export const ResponsesRequestSchema = z.object({
  model: z.string(),
  background: z.boolean().optional().default(false),
  conversation: z.record(z.unknown()).optional(),
  include: z.array(z.string()).optional(),
  input: ResponsesInputSchema,
  instructions: z.string().optional(),
  max_output_tokens: z.number().int().positive().optional(),
  reasoning: ResponsesReasoningSchema.optional().default({}),
  temperature: z.number().min(0).max(2).optional(),
  text: ResponsesTextSchema.optional(),
  top_p: z.number().min(0).max(1).optional(),
  truncation: z.enum(["disabled", "auto"]).optional().default("disabled"),
  tools: z.array(ResponsesToolSchema).optional(),
  stream: z.boolean().optional().default(false),
});

export type ResponsesRequest = z.infer<typeof ResponsesRequestSchema>;

// ============================================================================
// Response Types
// ============================================================================

/**
 * Usage information
 */
export const ResponsesUsageSchema = z.object({
  input_tokens: z.number().int(),
  output_tokens: z.number().int(),
  total_tokens: z.number().int(),
  input_tokens_details: z
    .object({
      cached_tokens: z.number().int(),
    })
    .optional(),
  output_tokens_details: z
    .object({
      reasoning_tokens: z.number().int(),
    })
    .optional(),
});

export type ResponsesUsage = z.infer<typeof ResponsesUsageSchema>;

/**
 * Output text content in response
 */
export const ResponsesOutputTextContentSchema = z.object({
  type: z.literal("output_text"),
  text: z.string(),
  annotations: z.array(z.unknown()).optional(),
  logprobs: z.array(z.unknown()).optional(),
});

export type ResponsesOutputTextContent = z.infer<typeof ResponsesOutputTextContentSchema>;

/**
 * Reasoning output in response
 */
export const ResponsesReasoningOutputSchema = z.object({
  type: z.literal("reasoning"),
  id: z.string(),
  summary: z.array(ResponsesReasoningSummarySchema),
  encrypted_content: z.string().optional(),
});

export type ResponsesReasoningOutput = z.infer<typeof ResponsesReasoningOutputSchema>;

/**
 * Function call in response
 */
export const ResponsesFunctionCallOutputResponseSchema = z.object({
  type: z.literal("function_call"),
  id: z.string(),
  call_id: z.string(),
  name: z.string(),
  arguments: z.string(),
  status: z.string().optional(),
});

export type ResponsesFunctionCallOutputResponse = z.infer<
  typeof ResponsesFunctionCallOutputResponseSchema
>;

/**
 * Message output in response
 */
export const ResponsesOutputMessageSchema = z.object({
  type: z.literal("message"),
  id: z.string(),
  status: z.string().optional(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.array(ResponsesOutputTextContentSchema),
});

export type ResponsesOutputMessage = z.infer<typeof ResponsesOutputMessageSchema>;

/**
 * Output item union
 */
export const ResponsesOutputItemSchema: z.ZodType<
  ResponsesOutputMessage | ResponsesFunctionCallOutputResponse | ResponsesReasoningOutput
> = z.discriminatedUnion("type", [
  ResponsesOutputMessageSchema,
  ResponsesFunctionCallOutputResponseSchema,
  ResponsesReasoningOutputSchema,
]);

export type ResponsesOutputItem = z.infer<typeof ResponsesOutputItemSchema>;

/**
 * Error details in response
 */
export const ResponsesErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export type ResponsesError = z.infer<typeof ResponsesErrorSchema>;

/**
 * Incomplete details (when response was truncated)
 */
export const ResponsesIncompleteDetailsSchema = z.object({
  reason: z.string(),
});

export type ResponsesIncompleteDetails = z.infer<typeof ResponsesIncompleteDetailsSchema>;

/**
 * Complete Responses API response
 */
export const ResponsesResponseSchema = z.object({
  id: z.string(),
  object: z.literal("response"),
  created_at: z.number().int(),
  completed_at: z.number().int().nullable(),
  status: z.enum(["in_progress", "completed", "incomplete", "failed"]),
  incomplete_details: ResponsesIncompleteDetailsSchema.optional(),
  model: z.string(),
  previous_response_id: z.string().optional(),
  instructions: z.string().optional(),
  output: z.array(ResponsesOutputItemSchema),
  error: ResponsesErrorSchema.optional(),
  tools: z.array(ResponsesToolSchema),
  tool_choice: z.unknown().optional(),
  truncation: z.string(),
  parallel_tool_calls: z.boolean(),
  text: ResponsesTextSchema,
  top_p: z.number(),
  presence_penalty: z.number(),
  frequency_penalty: z.number(),
  top_logprobs: z.number(),
  temperature: z.number(),
  reasoning: ResponsesReasoningSchema.optional(),
  usage: ResponsesUsageSchema.optional(),
  max_output_tokens: z.number().int().optional(),
  max_tool_calls: z.number().int().optional(),
  store: z.boolean(),
  background: z.boolean(),
  service_tier: z.string(),
  metadata: z.record(z.unknown()),
  safety_identifier: z.string().optional(),
  prompt_cache_key: z.string().optional(),
});

export type ResponsesResponse = z.infer<typeof ResponsesResponseSchema>;

// ============================================================================
// Streaming Events
// ============================================================================

/**
 * Stream event types
 */
export const ResponsesStreamEventTypeSchema = z.enum([
  "response.created",
  "response.in_progress",
  "response.delta",
  "reasoning.thinking",
  "reasoning.thinking_delta",
  "reasoning.done",
  "response.output_text.delta",
  "response.output_text.done",
  "response.function_call.created",
  "response.function_call.delta",
  "response.function_call.done",
  "response.done",
]);

export type ResponsesStreamEventType = z.infer<typeof ResponsesStreamEventTypeSchema>;

/**
 * Streaming event
 */
export const ResponsesStreamEventSchema = z.object({
  type: ResponsesStreamEventTypeSchema,
  sequence_number: z.number().int(),
  data: z.record(z.unknown()).optional(),
});

export type ResponsesStreamEvent = z.infer<typeof ResponsesStreamEventSchema>;

// ============================================================================
// Error Response
// ============================================================================

/**
 * Standard error response
 */
export const ErrorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
    code: z.string().optional(),
    param: z.string().optional(),
  }),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// ============================================================================
// Validation Helper
// ============================================================================

/**
 * Validates a request body and returns typed data or throws ZodError
 */
export function validateResponsesRequest(data: unknown): ResponsesRequest {
  return ResponsesRequestSchema.parse(data);
}

/**
 * Safe validation that returns result instead of throwing
 */
export function validateResponsesRequestSafe(
  data: unknown
): { success: true; data: ResponsesRequest } | { success: false; error: z.ZodError } {
  const result = ResponsesRequestSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
