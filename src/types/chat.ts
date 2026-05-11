// src/types/chat.ts
// Chat Completions API types - OpenAI compatible /v1/chat/completions

import { z } from "zod";
import type {
     ChatCompletionFunctionTool,
     ChatCompletionStreamOptions,
     ChatCompletionTool,
     ChatCompletionToolChoiceOption,
     CompletionUsage,
     FunctionDefinition,
     Logprobs,
     ReasoningEffort,
     ResponseFormat,
     ToolChoiceMode,
} from "./common";
import {
     ChatCompletionContentPartRefusalSchema,
     ChatCompletionContentPartSchema,
     ChatCompletionContentPartTextSchema,
     ChatCompletionStreamOptionsSchema,
     ChatCompletionToolChoiceOptionSchema,
     ChatCompletionToolSchema,
     CompletionUsageSchema,
     FinishReasonEnum,
     LogprobsSchema,
     PromptCacheRetentionEnum,
     ReasoningEffortEnum,
     ResponseFormatSchema,
     RoleEnum,
     ServiceTierEnum,
     SimpleContentPartSchema,
     VerbosityEnum,
     WebSearchOptionsSchema,
} from "./common";

// ====================
// Message Types
// ====================

export const ChatCompletionSystemMessageParamSchema = z.object({
     role: z.literal("system"),
     content: z.union([z.string(), z.array(SimpleContentPartSchema)]),
     name: z.string().optional(),
});
export type ChatCompletionSystemMessageParam = z.infer<
     typeof ChatCompletionSystemMessageParamSchema
>;

export const ChatCompletionUserMessageParamSchema = z.object({
     role: z.literal("user"),
     content: z.union([z.string(), z.array(ChatCompletionContentPartSchema)]),
     name: z.string().optional(),
});
export type ChatCompletionUserMessageParam = z.infer<
     typeof ChatCompletionUserMessageParamSchema
>;

export const ChatCompletionAssistantMessageParamSchema = z.object({
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
export type ChatCompletionAssistantMessageParam = z.infer<
     typeof ChatCompletionAssistantMessageParamSchema
>;

export const ChatCompletionToolMessageParamSchema = z.object({
     role: z.literal("tool"),
     content: z.union([z.string(), z.array(SimpleContentPartSchema)]),
     tool_call_id: z.string(),
});
export type ChatCompletionToolMessageParam = z.infer<
     typeof ChatCompletionToolMessageParamSchema
>;

export const ChatCompletionFunctionMessageParamSchema = z.object({
     role: z.literal("function"),
     content: z.string(),
     name: z.string(),
});
export type ChatCompletionFunctionMessageParam = z.infer<
     typeof ChatCompletionFunctionMessageParamSchema
>;

export const ChatCompletionDeveloperMessageParamSchema = z.object({
     role: z.literal("developer"),
     content: z.union([z.string(), z.array(SimpleContentPartSchema)]),
     name: z.string().optional(),
});
export type ChatCompletionDeveloperMessageParam = z.infer<
     typeof ChatCompletionDeveloperMessageParamSchema
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

// ====================
// Request Types
// ====================

export const ChatCompletionPredictionContentSchema = z.object({
     type: z.literal("content"),
     content: z.union([z.string(), z.array(SimpleContentPartSchema)]),
});
export type ChatCompletionPredictionContent = z.infer<
     typeof ChatCompletionPredictionContentSchema
>;

export const ChatCompletionRequestSchema = z.object({
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
     modalities: z.array(z.enum(["text", "audio"])).optional(),
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

// ====================
// Response Types
// ====================

export const ChatCompletionMessageSchema = z.object({
     content: z.string().nullable(),
     refusal: z.string().nullable(),
     role: z.literal("assistant"),
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

export const ChatCompletionChoiceSchema = z.object({
     finish_reason: FinishReasonEnum,
     index: z.number(),
     logprobs: LogprobsSchema.nullable(),
     message: ChatCompletionMessageSchema,
});
export type ChatCompletionChoice = z.infer<typeof ChatCompletionChoiceSchema>;

export const ChatCompletionResponseSchema = z.object({
     id: z.string(),
     choices: z.array(ChatCompletionChoiceSchema),
     created: z.number(),
     model: z.string(),
     object: z.literal("chat.completion"),
     service_tier: ServiceTierEnum.optional(),
     system_fingerprint: z.string().optional(),
     usage: CompletionUsageSchema.optional(),
});
export type ChatCompletionResponse = z.infer<
     typeof ChatCompletionResponseSchema
>;

// ====================
// Streaming Chunk Types
// ====================

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
                    function: z.object({
                         name: z.string().optional(),
                         arguments: z.string().optional(),
                    }),
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

// ====================
// Parsed Chunk (for internal use)
// ====================

export interface ParsedChunk {
     id: string;
     model: string;
     content: string;
     isDone: boolean;
     role?: string;
     finish_reason?: string | null;
     reasoning_content?: string;
}

// Re-export common types for convenience
export type {
     ChatCompletionFunctionTool,
     ChatCompletionStreamOptions,
     ChatCompletionTool,
     ChatCompletionToolChoiceOption,
     CompletionUsage,
     FunctionDefinition,
     Logprobs,
     ReasoningEffort,
     ResponseFormat,
     ToolChoiceMode,
};
