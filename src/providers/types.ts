import { z } from "zod";

// ------------------------------
// Enums
// ------------------------------

const RoleEnum = z.enum([
     "developer",
     "system",
     "user",
     "assistant",
     "tool",
     "function",
]);

const FinishReasonEnum = z.enum([
     "stop",
     "length",
     "tool_calls",
     "content_filter",
     "function_call",
]);

const DetailEnum = z.enum(["auto", "low", "high"]);

const ModalityEnum = z.enum(["text", "audio"]);

const ServiceTierEnum = z.enum([
     "auto",
     "default",
     "flex",
     "scale",
     "priority",
]);
const ReasoningEffortEnum = z.enum([
     "none",
     "minimal",
     "low",
     "medium",
     "high",
     "xhigh",
]);

const VerbosityEnum = z.enum(["low", "medium", "high"]);
const SearchContextSizeEnum = z.enum(["low", "medium", "high"]);

const PromptCacheRetentionEnum = z.enum(["in_memory", "24h"]);

// ------------------------------
// Content Part Schemas
// ------------------------------

const ChatCompletionContentPartTextSchema = z.object({
     type: z.literal("text"),
     text: z.string(),
});
// type ChatCompletionContentPartText = z.infer<
//      typeof ChatCompletionContentPartTextSchema
// >;

const FileContentPartSchema = z.object({
     type: z.literal("file"),
     file: z.object({
          file_data: z.string().optional(),
          file_id: z.string().optional(),
          filename: z.string().optional(),
     }),
});
const ChatCompletionContentPartSchema = z.union([
     ChatCompletionContentPartTextSchema,
     FileContentPartSchema,
]);

const SimpleContentPartSchema = ChatCompletionContentPartTextSchema;

const ChatCompletionContentPartRefusalSchema = z.object({
     type: z.literal("refusal"),
     refusal: z.string(),
});
// type ChatCompletionContentPartRefusal = z.infer<
//      typeof ChatCompletionContentPartRefusalSchema
// >;

// ------------------------------
// Message Schemas
// ------------------------------

const ChatCompletionDeveloperMessageParamSchema = z.object({
     role: z.literal("developer"),
     content: z.union([z.string(), z.array(SimpleContentPartSchema)]),
     name: z.string().optional(),
});
// type ChatCompletionDeveloperMessageParam = z.infer<
//      typeof ChatCompletionDeveloperMessageParamSchema
// >;

const ChatCompletionSystemMessageParamSchema = z.object({
     role: z.literal("system"),
     content: z.union([z.string(), z.array(SimpleContentPartSchema)]),
     name: z.string().optional(),
});
// type FileContentPart = z.infer<typeof FileContentPartSchema>;
// type ReasoningEffort = z.infer<typeof ReasoningEffortEnum>;
// type ServiceTier = z.infer<typeof ServiceTierEnum>;

// type Role = z.infer<typeof RoleEnum>;
// type Detail = z.infer<typeof DetailEnum>;
// type FinishReason = z.infer<typeof FinishReasonEnum>;
// type Modality = z.infer<typeof ModalityEnum>;
// type Verbosity = z.infer<typeof VerbosityEnum>;

// type SearchContextSize = z.infer<typeof SearchContextSizeEnum>;
// type PromptCacheRetention = z.infer<typeof PromptCacheRetentionEnum>;

// type ChatCompletionContentPart = z.infer<
//      typeof ChatCompletionContentPartSchema
// >;
// type SimpleContentPart = ChatCompletionContentPartText;
// type ChatCompletionSystemMessageParam = z.infer<
//      typeof ChatCompletionSystemMessageParamSchema
// >;

const ChatCompletionUserMessageParamSchema = z.object({
     role: z.literal("user"),
     content: z.union([z.string(), z.array(ChatCompletionContentPartSchema)]),
     name: z.string().optional(),
});
// type ChatCompletionUserMessageParam = z.infer<
//      typeof ChatCompletionUserMessageParamSchema
// >;

const ChatCompletionAssistantMessageParamSchema = z.object({
     role: z.literal("assistant"),

     content: z
          .union([
               z.string(),
               z.array(
                    z.union([
                         ChatCompletionContentPartTextSchema,
                         ChatCompletionContentPartRefusalSchema,
                    ]),
               ),
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
                              name: z.string(),
                         }),
                         type: z.literal("function"),
                    }),
                    z.object({
                         id: z.string(),
                         custom: z.object({
                              input: z.string(),
                              name: z.string(),
                         }),
                         type: z.literal("custom"),
                    }),
               ]),
          )
          .optional(),
});
// type ChatCompletionAssistantMessageParam = z.infer<
//      typeof ChatCompletionAssistantMessageParamSchema
// >;

const ChatCompletionToolMessageParamSchema = z.object({
     role: z.literal("tool"),
     content: z.union([z.string(), z.array(SimpleContentPartSchema)]),
     tool_call_id: z.string(),
});
// type ChatCompletionToolMessageParam = z.infer<
//      typeof ChatCompletionToolMessageParamSchema
// >;

const ChatCompletionFunctionMessageParamSchema = z.object({
     role: z.literal("function"),
     content: z.string(),
     name: z.string(),
});
// type ChatCompletionFunctionMessageParam = z.infer<
//      typeof ChatCompletionFunctionMessageParamSchema
// >;

const ChatCompletionMessageParamSchema = z.union([
     ChatCompletionDeveloperMessageParamSchema,
     ChatCompletionSystemMessageParamSchema,
     ChatCompletionUserMessageParamSchema,
     ChatCompletionAssistantMessageParamSchema,
     ChatCompletionToolMessageParamSchema,
     ChatCompletionFunctionMessageParamSchema,
]);
// type ChatCompletionMessageParam = z.infer<
//      typeof ChatCompletionMessageParamSchema
// >;

// ------------------------------
// Tools & Tool Choice
// ------------------------------

const FunctionDefinitionSchema = z.object({
     name: z.string().max(64),
     description: z.string().optional(),
     parameters: z.record(z.string(), z.unknown()).optional(),
     strict: z.boolean().optional(),
});
// type FunctionDefinition = z.infer<typeof FunctionDefinitionSchema>;

const ChatCompletionFunctionToolSchema = z.object({
     type: z.literal("function"),
     function: FunctionDefinitionSchema,
});
// type ChatCompletionFunctionTool = z.infer<
//      typeof ChatCompletionFunctionToolSchema
// >;

const GrammarFormatSchema = z.object({
     type: z.literal("grammar"),
     grammar: z.object({
          definition: z.string(),
          syntax: z.enum(["lark", "regex"]),
     }),
});
// type GrammarFormat = z.infer<typeof GrammarFormatSchema>;

const TextFormatSchema = z.object({
     type: z.literal("text"),
});
// type TextFormat = z.infer<typeof TextFormatSchema>;

const ChatCompletionCustomToolSchema = z.object({
     type: z.literal("custom"),
     custom: z.object({
          name: z.string(),
          description: z.string().optional(),
          format: z.union([TextFormatSchema, GrammarFormatSchema]).optional(),
     }),
});
// type ChatCompletionCustomTool = z.infer<typeof ChatCompletionCustomToolSchema>;

const ChatCompletionToolSchema = z.union([
     ChatCompletionFunctionToolSchema,
     ChatCompletionCustomToolSchema,
]);
// type ChatCompletionTool = z.infer<typeof ChatCompletionToolSchema>;

const ToolChoiceModeEnum = z.enum(["none", "auto", "required"]);
// type ToolChoiceMode = z.infer<typeof ToolChoiceModeEnum>;

const ChatCompletionAllowedToolChoiceSchema = z.object({
     type: z.literal("allowed_tools"),
     allowed_tools: z.object({
          mode: z.enum(["auto", "required"]),
          tools: z.array(z.record(z.string(), z.unknown())),
     }),
});
// type ChatCompletionAllowedToolChoice = z.infer<
//      typeof ChatCompletionAllowedToolChoiceSchema
// >;

const ChatCompletionNamedToolChoiceSchema = z.object({
     type: z.literal("function"),
     function: z.object({ name: z.string() }),
});
// type ChatCompletionNamedToolChoice = z.infer<
//      typeof ChatCompletionNamedToolChoiceSchema
// >;

const ChatCompletionNamedToolChoiceCustomSchema = z.object({
     type: z.literal("custom"),
     custom: z.object({ name: z.string() }),
});
// type ChatCompletionNamedToolChoiceCustom = z.infer<
//      typeof ChatCompletionNamedToolChoiceCustomSchema
// >;

const ChatCompletionToolChoiceOptionSchema = z.union([
     ToolChoiceModeEnum,
     ChatCompletionAllowedToolChoiceSchema,
     ChatCompletionNamedToolChoiceSchema,
     ChatCompletionNamedToolChoiceCustomSchema,
]);
// type ChatCompletionToolChoiceOption = z.infer<
//      typeof ChatCompletionToolChoiceOptionSchema
// >;

// ------------------------------
// Response Format
// ------------------------------

const ResponseFormatTextSchema = z.object({
     type: z.literal("text"),
});
// type ResponseFormatText = z.infer<typeof ResponseFormatTextSchema>;

const ResponseFormatJSONSchemaSchema = z.object({
     type: z.literal("json_schema"),
     json_schema: z.object({
          name: z.string().max(64),
          description: z.string().optional(),
          schema: z.record(z.string(), z.unknown()).optional(),
          strict: z.boolean().optional(),
     }),
});
// type ResponseFormatJSONSchema = z.infer<typeof ResponseFormatJSONSchemaSchema>;

const ResponseFormatJSONObjectSchema = z.object({
     type: z.literal("json_object"),
});
// type ResponseFormatJSONObject = z.infer<typeof ResponseFormatJSONObjectSchema>;

const ResponseFormatSchema = z.union([
     ResponseFormatTextSchema,
     ResponseFormatJSONSchemaSchema,
     ResponseFormatJSONObjectSchema,
]);
// type ResponseFormat = z.infer<typeof ResponseFormatSchema>;

// ------------------------------
// Prediction Content
// ------------------------------

const ChatCompletionPredictionContentSchema = z.object({
     type: z.literal("content"),
     content: z.union([z.string(), z.array(SimpleContentPartSchema)]),
});
// type ChatCompletionPredictionContent = z.infer<
//      typeof ChatCompletionPredictionContentSchema
// >;

// ------------------------------
// Web Search Options
// ------------------------------

const WebSearchOptionsSchema = z.object({
     search_context_size: SearchContextSizeEnum.optional(),
     user_location: z
          .object({
               type: z.literal("approximate"),
               approximate: z.object({
                    city: z.string().optional(),
                    country: z.string().optional(),
                    region: z.string().optional(),
                    timezone: z.string().optional(),
               }),
          })
          .optional(),
});
// type WebSearchOptions = z.infer<typeof WebSearchOptionsSchema>;

// ------------------------------
// Stream Options
// ------------------------------

const ChatCompletionStreamOptionsSchema = z.object({
     include_obfuscation: z.boolean().optional(),
     include_usage: z.boolean().optional(),
});
// type ChatCompletionStreamOptions = z.infer<
//      typeof ChatCompletionStreamOptionsSchema
// >;

// ------------------------------
// Request Body
// ------------------------------

const ChatCompletionRequestSchema = z.object({
     messages: z.array(ChatCompletionMessageParamSchema),
     model: z.string(),

     frequency_penalty: z.number().min(-2).max(2).optional(),
     function_call: z
          .union([z.enum(["none", "auto"]), z.object({ name: z.string() })])
          .optional(),
     functions: z
          .array(
               z.object({
                    name: z.string().max(64),
                    description: z.string().optional(),
                    parameters: z.record(z.string(), z.unknown()).optional(),
               }),
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
     web_search_options: WebSearchOptionsSchema.optional(),
});
type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

// ------------------------------
// Response Types
// ------------------------------

const ChatCompletionTokenLogprobSchema = z.object({
     token: z.string(),
     bytes: z.array(z.number()).nullable(),
     logprob: z.number(),
     top_logprobs: z.array(
          z.object({
               token: z.string(),
               bytes: z.array(z.number()).nullable(),
               logprob: z.number(),
          }),
     ),
});
// type ChatCompletionTokenLogprob = z.infer<
//      typeof ChatCompletionTokenLogprobSchema
// >;

const LogprobsSchema = z.object({
     content: z.array(ChatCompletionTokenLogprobSchema).optional(),
     refusal: z.array(ChatCompletionTokenLogprobSchema).optional(),
});
// type Logprobs = z.infer<typeof LogprobsSchema>;

const UrlCitationAnnotationSchema = z.object({
     type: z.literal("url_citation"),
     url_citation: z.object({
          end_index: z.number(),
          start_index: z.number(),
          title: z.string(),
          url: z.string(),
     }),
});
// type UrlCitationAnnotation = z.infer<typeof UrlCitationAnnotationSchema>;

const ChatCompletionMessageSchema = z.object({
     content: z.string().nullable(),
     refusal: z.string().nullable(),
     role: z.literal("assistant"),
     annotations: z.array(UrlCitationAnnotationSchema).optional(),

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
                              name: z.string(),
                         }),
                         type: z.literal("function"),
                    }),
                    z.object({
                         id: z.string(),
                         custom: z.object({
                              input: z.string(),
                              name: z.string(),
                         }),
                         type: z.literal("custom"),
                    }),
               ]),
          )
          .optional(),
});
// type ChatCompletionMessage = z.infer<typeof ChatCompletionMessageSchema>;

const ChatCompletionChoiceSchema = z.object({
     finish_reason: FinishReasonEnum,
     index: z.number(),
     logprobs: LogprobsSchema.nullable(),
     message: ChatCompletionMessageSchema,
});
// type ChatCompletionChoice = z.infer<typeof ChatCompletionChoiceSchema>;

const CompletionUsageSchema = z.object({
     completion_tokens: z.number(),
     prompt_tokens: z.number(),
     total_tokens: z.number(),
     completion_tokens_details: z
          .object({
               accepted_prediction_tokens: z.number().optional(),
               audio_tokens: z.number().optional(),
               reasoning_tokens: z.number().optional(),
               rejected_prediction_tokens: z.number().optional(),
          })
          .optional(),
     prompt_tokens_details: z
          .object({
               audio_tokens: z.number().optional(),
               cached_tokens: z.number().optional(),
          })
          .optional(),
});
// type CompletionUsage = z.infer<typeof CompletionUsageSchema>;

const ChatCompletionResponseSchema = z.object({
     id: z.string(),
     choices: z.array(ChatCompletionChoiceSchema),
     created: z.number(),
     model: z.string(),
     object: z.literal("chat.completion"),
     service_tier: ServiceTierEnum.optional(),
     system_fingerprint: z.string().optional(),
     usage: CompletionUsageSchema.optional(),
});
type ChatCompletionResponse = z.infer<typeof ChatCompletionResponseSchema>;

// ------------------------------
// Streaming Chunk
// ------------------------------

const ChatCompletionChunkDeltaSchema = z.object({
     role: RoleEnum.optional(),
     content: z.string().optional(),
     refusal: z.string().optional(),
     tool_calls: z
          .array(
               z.object({
                    index: z.number(),
                    id: z.string().optional(),
                    type: z.literal("function").optional(),
                    function: z
                         .object({
                              name: z.string().optional(),
                              arguments: z.string().optional(),
                         })
                         .optional(),
               }),
          )
          .optional(),
});
// type ChatCompletionChunkDelta = z.infer<typeof ChatCompletionChunkDeltaSchema>;

const ChatCompletionChunkChoiceSchema = z.object({
     index: z.number(),
     delta: ChatCompletionChunkDeltaSchema,
     logprobs: LogprobsSchema.nullable(),
     finish_reason: FinishReasonEnum.nullable(),
});
// type ChatCompletionChunkChoice = z.infer<
//      typeof ChatCompletionChunkChoiceSchema
// >;

const ChatCompletionChunkSchema = z.object({
     id: z.string(),
     object: z.literal("chat.completion.chunk"),
     created: z.number(),
     model: z.string(),
     system_fingerprint: z.string().optional(),
     choices: z.array(ChatCompletionChunkChoiceSchema),
     usage: CompletionUsageSchema.optional(),
});
type ChatCompletionChunk = z.infer<typeof ChatCompletionChunkSchema>;
// ====================
// Top-level Types (exported)
// ====================
export {
     ChatCompletionAllowedToolChoiceSchema,
     ChatCompletionAssistantMessageParamSchema,
     ChatCompletionChoiceSchema,
     ChatCompletionChunkChoiceSchema,
     ChatCompletionChunkDeltaSchema,
     ChatCompletionChunkSchema,
     ChatCompletionContentPartRefusalSchema,
     ChatCompletionContentPartSchema,
     ChatCompletionContentPartTextSchema,
     ChatCompletionCustomToolSchema,
     ChatCompletionDeveloperMessageParamSchema,
     ChatCompletionFunctionMessageParamSchema,
     ChatCompletionFunctionToolSchema,
     ChatCompletionMessageParamSchema,
     ChatCompletionMessageSchema,
     ChatCompletionNamedToolChoiceCustomSchema,
     ChatCompletionNamedToolChoiceSchema,
     ChatCompletionPredictionContentSchema,
     ChatCompletionRequestSchema,
     ChatCompletionResponseSchema,
     ChatCompletionStreamOptionsSchema,
     ChatCompletionSystemMessageParamSchema,
     ChatCompletionTokenLogprobSchema,
     ChatCompletionToolChoiceOptionSchema,
     ChatCompletionToolMessageParamSchema,
     ChatCompletionToolSchema,
     ChatCompletionUserMessageParamSchema,
     CompletionUsageSchema,
     DetailEnum,
     FileContentPartSchema,
     FinishReasonEnum,
     FunctionDefinitionSchema,
     GrammarFormatSchema,
     LogprobsSchema,
     ModalityEnum,
     PromptCacheRetentionEnum,
     ReasoningEffortEnum,
     ResponseFormatJSONObjectSchema,
     ResponseFormatJSONSchemaSchema,
     ResponseFormatSchema,
     ResponseFormatTextSchema,
     RoleEnum,
     SearchContextSizeEnum,
     ServiceTierEnum,
     SimpleContentPartSchema,
     TextFormatSchema,
     ToolChoiceModeEnum,
     UrlCitationAnnotationSchema,
     VerbosityEnum,
     WebSearchOptionsSchema,
};
export type {
     ChatCompletionChunk,
     ChatCompletionRequest,
     ChatCompletionResponse,
};
