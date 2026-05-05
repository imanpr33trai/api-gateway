import { z } from "zod";

// ------------------------------
// Enums
// ------------------------------

export const RoleEnum = z.enum([
     "developer",
     "system",
     "user",
     "assistant",
     "tool",
     "function",
]);
export type Role = z.infer<typeof RoleEnum>;

export const FinishReasonEnum = z.enum([
     "stop",
     "length",
     "tool_calls",
     "content_filter",
     "function_call",
]);
export type FinishReason = z.infer<typeof FinishReasonEnum>;

export const DetailEnum = z.enum(["auto", "low", "high"]);
export type Detail = z.infer<typeof DetailEnum>;

export const AudioFormatEnum = z.enum([
     "wav",
     "aac",
     "mp3",
     "flac",
     "opus",
     "pcm16",
]);
export type AudioFormat = z.infer<typeof AudioFormatEnum>;

export const BuiltinVoiceEnum = z.enum([
     "alloy",
     "ash",
     "ballad",
     "coral",
     "echo",
     "fable",
     "nova",
     "onyx",
     "sage",
     "shimmer",
     "verse",
     "marin",
     "cedar",
]);
export type BuiltinVoice = z.infer<typeof BuiltinVoiceEnum>;

export const ModalityEnum = z.enum(["text", "audio"]);
export type Modality = z.infer<typeof ModalityEnum>;

export const ServiceTierEnum = z.enum([
     "auto",
     "default",
     "flex",
     "scale",
     "priority",
]);
export type ServiceTier = z.infer<typeof ServiceTierEnum>;

export const ReasoningEffortEnum = z.enum([
     "none",
     "minimal",
     "low",
     "medium",
     "high",
     "xhigh",
]);
export type ReasoningEffort = z.infer<typeof ReasoningEffortEnum>;

export const VerbosityEnum = z.enum(["low", "medium", "high"]);
export type Verbosity = z.infer<typeof VerbosityEnum>;

export const SearchContextSizeEnum = z.enum(["low", "medium", "high"]);
export type SearchContextSize = z.infer<typeof SearchContextSizeEnum>;

export const PromptCacheRetentionEnum = z.enum(["in_memory", "24h"]);
export type PromptCacheRetention = z.infer<typeof PromptCacheRetentionEnum>;

// ------------------------------
// Content Part Schemas
// ------------------------------

export const ChatCompletionContentPartTextSchema = z.object({
     type: z.literal("text"),
     text: z.string(),
});
export type ChatCompletionContentPartText = z.infer<
     typeof ChatCompletionContentPartTextSchema
>;

export const ChatCompletionContentPartImageSchema = z.object({
     type: z.literal("image_url"),
     image_url: z.object({
          url: z.string(),
          detail: DetailEnum.optional(),
     }),
});
export type ChatCompletionContentPartImage = z.infer<
     typeof ChatCompletionContentPartImageSchema
>;

export const ChatCompletionContentPartInputAudioSchema = z.object({
     type: z.literal("input_audio"),
     input_audio: z.object({
          data: z.string(),
          format: z.enum(["wav", "mp3"]),
     }),
});
export type ChatCompletionContentPartInputAudio = z.infer<
     typeof ChatCompletionContentPartInputAudioSchema
>;

export const FileContentPartSchema = z.object({
     type: z.literal("file"),
     file: z.object({
          file_data: z.string().optional(),
          file_id: z.string().optional(),
          filename: z.string().optional(),
     }),
});
export type FileContentPart = z.infer<typeof FileContentPartSchema>;

export const ChatCompletionContentPartSchema = z.union([
     ChatCompletionContentPartTextSchema,
     ChatCompletionContentPartImageSchema,
     ChatCompletionContentPartInputAudioSchema,
     FileContentPartSchema,
]);
export type ChatCompletionContentPart = z.infer<
     typeof ChatCompletionContentPartSchema
>;

// For developer/system/tool messages, only text parts are allowed
export const SimpleContentPartSchema = ChatCompletionContentPartTextSchema;
export type SimpleContentPart = ChatCompletionContentPartText;

// Refusal part for assistant message
export const ChatCompletionContentPartRefusalSchema = z.object({
     type: z.literal("refusal"),
     refusal: z.string(),
});
export type ChatCompletionContentPartRefusal = z.infer<
     typeof ChatCompletionContentPartRefusalSchema
>;

// ------------------------------
// Message Schemas
// ------------------------------

// Developer message
export const ChatCompletionDeveloperMessageParamSchema = z.object({
     role: z.literal("developer"),
     content: z.union([z.string(), z.array(SimpleContentPartSchema)]),
     name: z.string().optional(),
});
export type ChatCompletionDeveloperMessageParam = z.infer<
     typeof ChatCompletionDeveloperMessageParamSchema
>;

// System message
export const ChatCompletionSystemMessageParamSchema = z.object({
     role: z.literal("system"),
     content: z.union([z.string(), z.array(SimpleContentPartSchema)]),
     name: z.string().optional(),
});
export type ChatCompletionSystemMessageParam = z.infer<
     typeof ChatCompletionSystemMessageParamSchema
>;

// User message
export const ChatCompletionUserMessageParamSchema = z.object({
     role: z.literal("user"),
     content: z.union([z.string(), z.array(ChatCompletionContentPartSchema)]),
     name: z.string().optional(),
});
export type ChatCompletionUserMessageParam = z.infer<
     typeof ChatCompletionUserMessageParamSchema
>;

// Assistant message (in request, for conversation history)
export const ChatCompletionAssistantMessageParamSchema = z.object({
     role: z.literal("assistant"),
     audio: z.object({ id: z.string() }).optional(),
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
export type ChatCompletionAssistantMessageParam = z.infer<
     typeof ChatCompletionAssistantMessageParamSchema
>;

// Tool message
export const ChatCompletionToolMessageParamSchema = z.object({
     role: z.literal("tool"),
     content: z.union([z.string(), z.array(SimpleContentPartSchema)]),
     tool_call_id: z.string(),
});
export type ChatCompletionToolMessageParam = z.infer<
     typeof ChatCompletionToolMessageParamSchema
>;

// Function message (deprecated)
export const ChatCompletionFunctionMessageParamSchema = z.object({
     role: z.literal("function"),
     content: z.string(),
     name: z.string(),
});
export type ChatCompletionFunctionMessageParam = z.infer<
     typeof ChatCompletionFunctionMessageParamSchema
>;

export const ChatCompletionMessageParamSchema = z.union([
     ChatCompletionDeveloperMessageParamSchema,
     ChatCompletionSystemMessageParamSchema,
     ChatCompletionUserMessageParamSchema,
     ChatCompletionAssistantMessageParamSchema,
     ChatCompletionToolMessageParamSchema,
     ChatCompletionFunctionMessageParamSchema,
]);
export type ChatCompletionMessageParam = z.infer<
     typeof ChatCompletionMessageParamSchema
>;

// ------------------------------
// Tools & Tool Choice
// ------------------------------

export const FunctionDefinitionSchema = z.object({
     name: z.string().max(64),
     description: z.string().optional(),
     parameters: z.record(z.string(), z.unknown()).optional(),
     strict: z.boolean().optional(),
});
export type FunctionDefinition = z.infer<typeof FunctionDefinitionSchema>;

export const ChatCompletionFunctionToolSchema = z.object({
     type: z.literal("function"),
     function: FunctionDefinitionSchema,
});
export type ChatCompletionFunctionTool = z.infer<
     typeof ChatCompletionFunctionToolSchema
>;

export const GrammarFormatSchema = z.object({
     type: z.literal("grammar"),
     grammar: z.object({
          definition: z.string(),
          syntax: z.enum(["lark", "regex"]),
     }),
});
export type GrammarFormat = z.infer<typeof GrammarFormatSchema>;

export const TextFormatSchema = z.object({
     type: z.literal("text"),
});
export type TextFormat = z.infer<typeof TextFormatSchema>;

export const ChatCompletionCustomToolSchema = z.object({
     type: z.literal("custom"),
     custom: z.object({
          name: z.string(),
          description: z.string().optional(),
          format: z.union([TextFormatSchema, GrammarFormatSchema]).optional(),
     }),
});
export type ChatCompletionCustomTool = z.infer<
     typeof ChatCompletionCustomToolSchema
>;

export const ChatCompletionToolSchema = z.union([
     ChatCompletionFunctionToolSchema,
     ChatCompletionCustomToolSchema,
]);
export type ChatCompletionTool = z.infer<typeof ChatCompletionToolSchema>;

export const ToolChoiceModeEnum = z.enum(["none", "auto", "required"]);
export type ToolChoiceMode = z.infer<typeof ToolChoiceModeEnum>;

export const ChatCompletionAllowedToolChoiceSchema = z.object({
     type: z.literal("allowed_tools"),
     allowed_tools: z.object({
          mode: z.enum(["auto", "required"]),
          tools: z.array(z.record(z.string(), z.unknown())),
     }),
});
export type ChatCompletionAllowedToolChoice = z.infer<
     typeof ChatCompletionAllowedToolChoiceSchema
>;

export const ChatCompletionNamedToolChoiceSchema = z.object({
     type: z.literal("function"),
     function: z.object({ name: z.string() }),
});
export type ChatCompletionNamedToolChoice = z.infer<
     typeof ChatCompletionNamedToolChoiceSchema
>;

export const ChatCompletionNamedToolChoiceCustomSchema = z.object({
     type: z.literal("custom"),
     custom: z.object({ name: z.string() }),
});
export type ChatCompletionNamedToolChoiceCustom = z.infer<
     typeof ChatCompletionNamedToolChoiceCustomSchema
>;

export const ChatCompletionToolChoiceOptionSchema = z.union([
     ToolChoiceModeEnum,
     ChatCompletionAllowedToolChoiceSchema,
     ChatCompletionNamedToolChoiceSchema,
     ChatCompletionNamedToolChoiceCustomSchema,
]);
export type ChatCompletionToolChoiceOption = z.infer<
     typeof ChatCompletionToolChoiceOptionSchema
>;

// ------------------------------
// Response Format
// ------------------------------

export const ResponseFormatTextSchema = z.object({
     type: z.literal("text"),
});
export type ResponseFormatText = z.infer<typeof ResponseFormatTextSchema>;

export const ResponseFormatJSONSchemaSchema = z.object({
     type: z.literal("json_schema"),
     json_schema: z.object({
          name: z.string().max(64),
          description: z.string().optional(),
          schema: z.record(z.string(), z.unknown()).optional(),
          strict: z.boolean().optional(),
     }),
});
export type ResponseFormatJSONSchema = z.infer<
     typeof ResponseFormatJSONSchemaSchema
>;

export const ResponseFormatJSONObjectSchema = z.object({
     type: z.literal("json_object"),
});
export type ResponseFormatJSONObject = z.infer<
     typeof ResponseFormatJSONObjectSchema
>;

export const ResponseFormatSchema = z.union([
     ResponseFormatTextSchema,
     ResponseFormatJSONSchemaSchema,
     ResponseFormatJSONObjectSchema,
]);
export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;

// ------------------------------
// Audio Param
// ------------------------------

export const ChatCompletionAudioParamSchema = z.object({
     format: AudioFormatEnum,
     voice: z.union([
          z.string(),
          BuiltinVoiceEnum,
          z.object({ id: z.string() }),
     ]),
});
export type ChatCompletionAudioParam = z.infer<
     typeof ChatCompletionAudioParamSchema
>;

// ------------------------------
// Prediction Content
// ------------------------------

export const ChatCompletionPredictionContentSchema = z.object({
     type: z.literal("content"),
     content: z.union([z.string(), z.array(SimpleContentPartSchema)]),
});
export type ChatCompletionPredictionContent = z.infer<
     typeof ChatCompletionPredictionContentSchema
>;

// ------------------------------
// Web Search Options
// ------------------------------

export const WebSearchOptionsSchema = z.object({
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
export type WebSearchOptions = z.infer<typeof WebSearchOptionsSchema>;

// ------------------------------
// Stream Options
// ------------------------------

export const ChatCompletionStreamOptionsSchema = z.object({
     include_obfuscation: z.boolean().optional(),
     include_usage: z.boolean().optional(),
});
export type ChatCompletionStreamOptions = z.infer<
     typeof ChatCompletionStreamOptionsSchema
>;

// ------------------------------
// Request Body
// ------------------------------

// Model ID can be any of the known literals or a custom string – we use string union for known ones
export const KnownModelEnum = z.enum([
     "gpt-5.4",
     "gpt-5.4-mini",
     "gpt-5.4-nano",
     "gpt-5.4-mini-2026-03-17",
     "gpt-5.4-nano-2026-03-17",
     "gpt-5.3-chat-latest",
     "gpt-5.2",
     "gpt-5.2-2025-12-11",
     "gpt-5.2-chat-latest",
     "gpt-5.2-pro",
     "gpt-5.2-pro-2025-12-11",
     "gpt-5.1",
     "gpt-5.1-2025-11-13",
     "gpt-5.1-codex",
     "gpt-5.1-mini",
     "gpt-5.1-chat-latest",
     "gpt-5",
     "gpt-5-mini",
     "gpt-5-nano",
     "gpt-5-2025-08-07",
     "gpt-5-mini-2025-08-07",
     "gpt-5-nano-2025-08-07",
     "gpt-5-chat-latest",
     "gpt-4.1",
     "gpt-4.1-mini",
     "gpt-4.1-nano",
     "gpt-4.1-2025-04-14",
     "gpt-4.1-mini-2025-04-14",
     "gpt-4.1-nano-2025-04-14",
     "o4-mini",
     "o4-mini-2025-04-16",
     "o3",
     "o3-2025-04-16",
     "o3-mini",
     "o3-mini-2025-01-31",
     "o1",
     "o1-2024-12-17",
     "o1-preview",
     "o1-preview-2024-09-12",
     "o1-mini",
     "o1-mini-2024-09-12",
     "gpt-4o",
     "gpt-4o-2024-11-20",
     "gpt-4o-2024-08-06",
     "gpt-4o-2024-05-13",
     "gpt-4o-audio-preview",
     "gpt-4o-audio-preview-2024-10-01",
     "gpt-4o-audio-preview-2024-12-17",
     "gpt-4o-audio-preview-2025-06-03",
     "gpt-4o-mini-audio-preview",
     "gpt-4o-mini-audio-preview-2024-12-17",
     "gpt-4o-search-preview",
     "gpt-4o-mini-search-preview",
     "gpt-4o-search-preview-2025-03-11",
     "gpt-4o-mini-search-preview-2025-03-11",
     "chatgpt-4o-latest",
     "codex-mini-latest",
     "gpt-4o-mini",
     "gpt-4o-mini-2024-07-18",
     "gpt-4-turbo",
     "gpt-4-turbo-2024-04-09",
     "gpt-4-0125-preview",
     "gpt-4-turbo-preview",
     "gpt-4-1106-preview",
     "gpt-4-vision-preview",
     "gpt-4",
     "gpt-4-0314",
     "gpt-4-0613",
     "gpt-4-32k",
     "gpt-4-32k-0314",
     "gpt-4-32k-0613",
     "gpt-3.5-turbo",
     "gpt-3.5-turbo-16k",
     "gpt-3.5-turbo-0301",
     "gpt-3.5-turbo-0613",
     "gpt-3.5-turbo-1106",
     "gpt-3.5-turbo-0125",
     "gpt-3.5-turbo-16k-0613",
]);
export type KnownModel = z.infer<typeof KnownModelEnum>;

export const ChatCompletionRequestSchema = z.object({
     messages: z.array(ChatCompletionMessageParamSchema),
     model: z.union([z.string(), KnownModelEnum]),
     audio: ChatCompletionAudioParamSchema.optional(),
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
     metadata: z
          .record(z.string().max(64), z.string().max(512))

          .optional(),
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
export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

// ------------------------------
// Response Types
// ------------------------------

// Logprob types
export const ChatCompletionTokenLogprobSchema = z.object({
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
export type ChatCompletionTokenLogprob = z.infer<
     typeof ChatCompletionTokenLogprobSchema
>;

// Choice's logprobs
export const LogprobsSchema = z.object({
     content: z.array(ChatCompletionTokenLogprobSchema).optional(),
     refusal: z.array(ChatCompletionTokenLogprobSchema).optional(),
});
export type Logprobs = z.infer<typeof LogprobsSchema>;

// Annotations
export const UrlCitationAnnotationSchema = z.object({
     type: z.literal("url_citation"),
     url_citation: z.object({
          end_index: z.number(),
          start_index: z.number(),
          title: z.string(),
          url: z.string(),
     }),
});
export type UrlCitationAnnotation = z.infer<typeof UrlCitationAnnotationSchema>;

// Assistant message in response
export const ChatCompletionMessageSchema = z.object({
     content: z.string().nullable(),
     refusal: z.string().nullable(),
     role: z.literal("assistant"),
     annotations: z.array(UrlCitationAnnotationSchema).optional(),
     audio: z
          .object({
               id: z.string(),
               data: z.string(),
               expires_at: z.number(),
               transcript: z.string(),
          })
          .optional(),
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
export type ChatCompletionMessage = z.infer<typeof ChatCompletionMessageSchema>;

// Choice
export const ChatCompletionChoiceSchema = z.object({
     finish_reason: FinishReasonEnum,
     index: z.number(),
     logprobs: LogprobsSchema.nullable(),
     message: ChatCompletionMessageSchema,
});
export type ChatCompletionChoice = z.infer<typeof ChatCompletionChoiceSchema>;

// Usage details
export const CompletionUsageSchema = z.object({
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
export type CompletionUsage = z.infer<typeof CompletionUsageSchema>;

// Chat completion object
export const ChatCompletionSchema = z.object({
     id: z.string(),
     choices: z.array(ChatCompletionChoiceSchema),
     created: z.number(),
     model: z.string(),
     object: z.literal("chat.completion"),
     service_tier: ServiceTierEnum.optional(),
     system_fingerprint: z.string().optional(),
     usage: CompletionUsageSchema.optional(),
});
export type ChatCompletion = z.infer<typeof ChatCompletionSchema>;

// ------------------------------
// Streaming Chunk
// ------------------------------

export const ChatCompletionChunkDeltaSchema = z.object({
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
export type ChatCompletionChunkDelta = z.infer<
     typeof ChatCompletionChunkDeltaSchema
>;

export const ChatCompletionChunkChoiceSchema = z.object({
     index: z.number(),
     delta: ChatCompletionChunkDeltaSchema,
     logprobs: LogprobsSchema.nullable(),
     finish_reason: FinishReasonEnum.nullable(),
});
export type ChatCompletionChunkChoice = z.infer<
     typeof ChatCompletionChunkChoiceSchema
>;

export const ChatCompletionChunkSchema = z.object({
     id: z.string(),
     object: z.literal("chat.completion.chunk"),
     created: z.number(),
     model: z.string(),
     system_fingerprint: z.string().optional(),
     choices: z.array(ChatCompletionChunkChoiceSchema),
     usage: CompletionUsageSchema.optional(),
});
export type ChatCompletionChunk = z.infer<typeof ChatCompletionChunkSchema>;
