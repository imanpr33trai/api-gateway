// src/types/responses.type.ts
import { z } from "zod";

// ── Enums ─────────────────────────────────────────────────────
const RoleEnum = z.enum(["user", "system", "developer"]);
const ContentTypeEnum = z.enum([
     "input_text",
     "input_image",
     "output_text",
     "input_file",
]);
const InputItemTypeEnum = z.enum([
     "message",
     "function_call",
     "function_call_output",
     "reasoning",
]);
const OutputItemTypeEnum = z.enum(["message", "function_call", "reasoning"]);
const ReasoningEffortEnum = z.enum(["none", "low", "medium", "high", "max"]);
const TextFormatTypeEnum = z.enum(["text", "json_schema"]);
const TruncationEnum = z.enum(["auto", "disabled"]);
const ServiceTierEnum = z.enum([
     "auto",
     "default",
     "flex",
     "scale",
     "priority",
]);

// ── Content Parts ─────────────────────────────────────────────
const ResponsesTextContentSchema = z.object({
     type: z.literal("input_text"),
     text: z.string(),
});
type ResponsesTextContent = z.infer<typeof ResponsesTextContentSchema>;

const ResponsesImageContentSchema = z.object({
     type: z.literal("input_image"),
     detail: z.string(), // required in Go, so we keep required
     file_id: z.string().optional(),
     image_url: z.string().optional(),
});
type ResponsesImageContent = z.infer<typeof ResponsesImageContentSchema>;

const ResponsesOutputTextContentSchema = z.object({
     type: z.literal("output_text"),
     text: z.string(),
});
type ResponsesOutputTextContent = z.infer<
     typeof ResponsesOutputTextContentSchema
>;

const ResponsesFileContentSchema = z.object({
     type: z.literal("input_file"),
     file_data: z.string().optional(),
     file_id: z.string().optional(),
     file_url: z.string().optional(),
     filename: z.string().optional(),
});
type ResponsesFileContent = z.infer<typeof ResponsesFileContentSchema>;

const ResponsesContentSchema = z.discriminatedUnion("type", [
     ResponsesTextContentSchema,
     ResponsesImageContentSchema,
     ResponsesOutputTextContentSchema,
     ResponsesFileContentSchema,
]);
type ResponsesContent = z.infer<typeof ResponsesContentSchema>;

// ── Input Items ───────────────────────────────────────────────
const ResponsesInputMessageSchema = z.object({
     type: z.literal("message"),
     role: RoleEnum,
     content: z.union([z.string(), z.array(ResponsesContentSchema)]).optional(),
});
type ResponsesInputMessage = z.infer<typeof ResponsesInputMessageSchema>;

const ResponsesFunctionCallSchema = z.object({
     id: z.string().optional(),
     type: z.literal("function_call"),
     call_id: z.string(),
     name: z.string(),
     arguments: z.string(), // JSON string
});
type ResponsesFunctionCall = z.infer<typeof ResponsesFunctionCallSchema>;

const ResponsesFunctionCallOutputSchema = z.object({
     type: z.literal("function_call_output"),
     call_id: z.string(),
     output: z.string(), // string or array of content; we simplify to string for now
});
type ResponsesFunctionCallOutput = z.infer<
     typeof ResponsesFunctionCallOutputSchema
>;

const ResponsesReasoningSummarySchema = z.object({
     type: z.literal("summary_text"),
     text: z.string(),
});

const ResponsesReasoningInputSchema = z.object({
     id: z.string().optional(),
     type: z.literal("reasoning"),
     summary: z.array(ResponsesReasoningSummarySchema).optional(),
     encrypted_content: z.string().optional(),
});
type ResponsesReasoningInput = z.infer<typeof ResponsesReasoningInputSchema>;

const ResponsesInputItemSchema = z.discriminatedUnion("type", [
     ResponsesInputMessageSchema,
     ResponsesFunctionCallSchema,
     ResponsesFunctionCallOutputSchema,
     ResponsesReasoningInputSchema,
]);
type ResponsesInputItem = z.infer<typeof ResponsesInputItemSchema>;

// ── Configuration Objects ─────────────────────────────────────
const ResponsesReasoningSchema = z.object({
     effort: ReasoningEffortEnum.optional(),
     generate_summary: z.enum(["auto", "concise", "detailed"]).optional(),
     summary: z.enum(["auto", "concise", "detailed"]).optional(),
});
type ResponsesReasoning = z.infer<typeof ResponsesReasoningSchema>;

const ResponsesTextFormatSchema = z.object({
     type: TextFormatTypeEnum,
     name: z.string().optional(),
     schema: z.record(z.string(), z.unknown()).optional(), // JSON Schema
     strict: z.boolean().optional(),
});
type ResponsesTextFormat = z.infer<typeof ResponsesTextFormatSchema>;

const ResponsesToolSchema = z.object({
     type: z.literal("function"),
     name: z.string(),
     description: z.string().nullable().optional(),
     strict: z.boolean().nullable().optional(),
     parameters: z.record(z.string(), z.unknown()).optional(),
});
type ResponsesTool = z.infer<typeof ResponsesToolSchema>;

// ── Request ───────────────────────────────────────────────────
const ResponsesRequestSchema = z.object({
     model: z.string(),
     background: z.boolean().optional().default(false),
     conversation: z.unknown().optional(), // not supported, but we accept anything
     include: z.array(z.string()).optional(),
     input: z.union([z.string(), z.array(ResponsesInputItemSchema)]),
     instructions: z.string().optional(),
     max_output_tokens: z.number().int().positive().optional(),
     reasoning: ResponsesReasoningSchema.optional().default({}),
     temperature: z.number().min(0).max(2).optional(),
     text: z
          .object({
               format: ResponsesTextFormatSchema.optional(),
          })
          .optional(),
     top_p: z.number().min(0).max(1).optional(),
     truncation: TruncationEnum.optional(),
     tools: z.array(ResponsesToolSchema).optional(),
     stream: z.boolean().optional().default(false),
});
type ResponsesRequest = z.infer<typeof ResponsesRequestSchema>;

// ── Response ──────────────────────────────────────────────────
const ResponsesErrorSchema = z.object({
     code: z.string(),
     message: z.string(),
});
type ResponsesError = z.infer<typeof ResponsesErrorSchema>;

const ResponsesIncompleteDetailsSchema = z.object({
     reason: z.string(),
});
type ResponsesIncompleteDetails = z.infer<
     typeof ResponsesIncompleteDetailsSchema
>;

const ResponsesOutputContentSchema = z.object({
     type: z.literal("output_text"),
     text: z.string(),
     annotations: z.array(z.unknown()),
     logprobs: z.array(z.unknown()),
});
type ResponsesOutputContent = z.infer<typeof ResponsesOutputContentSchema>;

const ResponsesOutputItemSchema = z.discriminatedUnion("type", [
     z.object({
          id: z.string(),
          type: z.literal("message"),
          status: z.enum(["completed", "in_progress"]).optional(),
          role: z.literal("assistant"),
          content: z.array(ResponsesOutputContentSchema),
     }),
     z.object({
          id: z.string(),
          type: z.literal("function_call"),
          status: z.enum(["completed", "in_progress"]).optional(),
          call_id: z.string(),
          name: z.string(),
          arguments: z.string(),
     }),
     z.object({
          id: z.string(),
          type: z.literal("reasoning"),
          summary: z.array(ResponsesReasoningSummarySchema).optional(),
          encrypted_content: z.string().optional(),
     }),
]);
type ResponsesOutputItem = z.infer<typeof ResponsesOutputItemSchema>;

const ResponsesUsageSchema = z.object({
     input_tokens: z.number().int(),
     output_tokens: z.number().int(),
     total_tokens: z.number().int(),
     input_tokens_details: z.object({
          cached_tokens: z.number().int(),
     }),
     output_tokens_details: z.object({
          reasoning_tokens: z.number().int(),
     }),
});
type ResponsesUsage = z.infer<typeof ResponsesUsageSchema>;

const ResponsesReasoningOutputSchema = z.object({
     effort: ReasoningEffortEnum.optional(),
     summary: z.enum(["auto", "concise", "detailed"]).optional(),
});
type ResponsesReasoningOutput = z.infer<typeof ResponsesReasoningOutputSchema>;

const ResponsesResponseSchema = z.object({
     id: z.string(),
     object: z.literal("response"),
     created_at: z.number(),
     completed_at: z.number().nullable(),
     status: z.string(),
     incomplete_details: ResponsesIncompleteDetailsSchema.nullable().optional(),
     model: z.string(),
     previous_response_id: z.string().nullable().optional(),
     instructions: z.string().nullable().optional(),
     output: z.array(ResponsesOutputItemSchema),
     error: ResponsesErrorSchema.nullable().optional(),
     tools: z.array(ResponsesToolSchema),
     tool_choice: z.unknown(),
     truncation: z.string(),
     parallel_tool_calls: z.boolean(),
     text: z.object({
          format: ResponsesTextFormatSchema,
     }),
     top_p: z.number(),
     presence_penalty: z.number(),
     frequency_penalty: z.number(),
     top_logprobs: z.number().int(),
     temperature: z.number(),
     reasoning: ResponsesReasoningOutputSchema.nullable().optional(),
     usage: ResponsesUsageSchema.nullable().optional(),
     max_output_tokens: z.number().int().nullable().optional(),
     max_tool_calls: z.number().int().nullable().optional(),
     store: z.boolean(),
     background: z.boolean(),
     service_tier: ServiceTierEnum,
     metadata: z.record(z.string(), z.unknown()),
     safety_identifier: z.string().nullable().optional(),
     prompt_cache_key: z.string().nullable().optional(),
});
type ResponsesResponse = z.infer<typeof ResponsesResponseSchema>;

// ── Streaming Events ──────────────────────────────────────────
const ResponsesStreamEventTypeEnum = z.enum([
     "response.created",
     "response.in_progress",
     "response.completed",
     "response.output_item.added",
     "response.output_item.done",
     "response.content_part.added",
     "response.content_part.done",
     "response.output_text.delta",
     "response.output_text.done",
     "response.function_call_arguments.delta",
     "response.function_call_arguments.done",
     "response.reasoning_summary_text.delta",
     "response.reasoning_summary_text.done",
]);

// Each stream event has an event type and a data payload (any)
const ResponsesStreamEventSchema = z.object({
     event: ResponsesStreamEventTypeEnum,
     data: z.record(z.string(), z.unknown()), // generic object
});
type ResponsesStreamEvent = z.infer<typeof ResponsesStreamEventSchema>;

// ── Exports ───────────────────────────────────────────────────
export {
     ResponsesContentSchema,
     ResponsesErrorSchema,
     ResponsesFileContentSchema,
     ResponsesFunctionCallOutputSchema,
     ResponsesFunctionCallSchema,
     ResponsesImageContentSchema,
     ResponsesIncompleteDetailsSchema,
     ResponsesInputItemSchema,
     ResponsesInputMessageSchema,
     ResponsesOutputContentSchema,
     ResponsesOutputItemSchema,
     ResponsesOutputTextContentSchema,
     ResponsesReasoningInputSchema,
     ResponsesReasoningOutputSchema,
     ResponsesReasoningSchema,
     ResponsesRequestSchema,
     ResponsesResponseSchema,
     ResponsesStreamEventSchema,
     // Schemas
     ResponsesTextContentSchema,
     ResponsesTextFormatSchema,
     ResponsesToolSchema,
     ResponsesUsageSchema,
};

export type {
     ResponsesContent,
     ResponsesError,
     ResponsesFileContent,
     ResponsesFunctionCall,
     ResponsesFunctionCallOutput,
     ResponsesImageContent,
     ResponsesIncompleteDetails,
     ResponsesInputItem,
     ResponsesInputMessage,
     ResponsesOutputContent,
     ResponsesOutputItem,
     ResponsesOutputTextContent,
     ResponsesReasoning,
     ResponsesReasoningInput,
     ResponsesReasoningOutput,
     ResponsesRequest,
     ResponsesResponse,
     ResponsesStreamEvent,
     ResponsesTextContent,
     ResponsesTextFormat,
     ResponsesTool,
     ResponsesUsage,
};
