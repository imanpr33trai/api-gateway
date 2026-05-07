// src/types/common.ts
// Common/shared types, enums, and utilities used across the project

import { z } from "zod";

// ====================
// Enums
// ====================

export const RoleEnum = z.enum(["developer", "system", "user", "assistant", "tool", "function"]);
export type RoleEnum = z.infer<typeof RoleEnum>;

export const FinishReasonEnum = z.enum(["stop", "length", "tool_calls", "content_filter", "function_call"]);
export type FinishReason = z.infer<typeof FinishReasonEnum>;

export const DetailEnum = z.enum(["auto", "low", "high"]);
export type Detail = z.infer<typeof DetailEnum>;

export const ModalityEnum = z.enum(["text", "audio"]);
export type Modality = z.infer<typeof ModalityEnum>;

export const ServiceTierEnum = z.enum(["auto", "default", "flex", "scale", "priority"]);
export type ServiceTier = z.infer<typeof ServiceTierEnum>;

export const ReasoningEffortEnum = z.enum(["none", "low", "medium", "high", "max"]);
export type ReasoningEffort = z.infer<typeof ReasoningEffortEnum>;

export const VerbosityEnum = z.enum(["low", "medium", "high"]);
export type Verbosity = z.infer<typeof VerbosityEnum>;

export const SearchContextSizeEnum = z.enum(["low", "medium", "high"]);
export type SearchContextSize = z.infer<typeof SearchContextSizeEnum>;

export const PromptCacheRetentionEnum = z.enum(["in_memory", "24h"]);
export type PromptCacheRetention = z.infer<typeof PromptCacheRetentionEnum>;

// Legacy Role enum for backward compatibility
export enum Role {
    SYSTEM = "system",
    CONTEXT = "context",
    USER = "user",
    ASSISTANT = "assistant",
    TOOL = "tool",
}

// ====================
// Common Content Types
// ====================

export const ChatCompletionContentPartTextSchema = z.object({
    type: z.literal("text"),
    text: z.string(),
});
export type ChatCompletionContentPartText = z.infer<typeof ChatCompletionContentPartTextSchema>;

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
    FileContentPartSchema,
]);
export type ChatCompletionContentPart = z.infer<typeof ChatCompletionContentPartSchema>;

export const SimpleContentPartSchema = ChatCompletionContentPartTextSchema;
export type SimpleContentPart = z.infer<typeof SimpleContentPartSchema>;

export const ChatCompletionContentPartRefusalSchema = z.object({
    type: z.literal("refusal"),
    refusal: z.string(),
});
export type ChatCompletionContentPartRefusal = z.infer<typeof ChatCompletionContentPartRefusalSchema>;

// ====================
// Usage Types
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

export const ResponseUsageSchema = z.object({
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
export type ResponseUsage = z.infer<typeof ResponseUsageSchema>;

// ====================
// Logprobs
// ====================

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
export type ChatCompletionTokenLogprob = z.infer<typeof ChatCompletionTokenLogprobSchema>;

export const LogprobsSchema = z.object({
    content: z.array(ChatCompletionTokenLogprobSchema).optional(),
    refusal: z.array(ChatCompletionTokenLogprobSchema).optional(),
});
export type Logprobs = z.infer<typeof LogprobsSchema>;

// ====================
// Tool Types
// ====================

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
export type ChatCompletionFunctionTool = z.infer<typeof ChatCompletionFunctionToolSchema>;

export const ToolChoiceModeEnum = z.enum(["none", "auto", "required"]);
export type ToolChoiceMode = z.infer<typeof ToolChoiceModeEnum>;

export const ChatCompletionToolChoiceOptionSchema = z.union([
    ToolChoiceModeEnum,
    z.object({
        type: z.literal("allowed_tools"),
        allowed_tools: z.object({
            mode: z.enum(["auto", "required"]),
            tools: z.array(z.record(z.string(), z.unknown())),
        }),
    }),
    z.object({
        type: z.literal("function"),
        function: z.object({ name: z.string() }),
    }),
]);
export type ChatCompletionToolChoiceOption = z.infer<typeof ChatCompletionToolChoiceOptionSchema>;

export const ChatCompletionToolSchema = z.union([
    ChatCompletionFunctionToolSchema,
    z.object({
        type: z.literal("custom"),
        custom: z.object({
            name: z.string(),
            description: z.string().optional(),
            format: z
                .union([
                    z.object({ type: z.literal("text") }),
                    z.object({
                        type: z.literal("grammar"),
                        grammar: z.object({
                            definition: z.string(),
                            syntax: z.enum(["lark", "regex"]),
                        }),
                    }),
                ])
                .optional(),
        }),
    }),
]);
export type ChatCompletionTool = z.infer<typeof ChatCompletionToolSchema>;

// Legacy tool schema for backward compatibility
export const ToolCallSchema = z.object({
    type: z.literal("function"),
    function: z.object({
        name: z.string(),
        parameters: z.record(z.string(), z.unknown()),
        description: z.string(),
    }),
});

// ====================
// Response Format
// ====================

export const ResponseFormatTextSchema = z.object({
    type: z.literal("text"),
});

export const ResponseFormatJSONSchemaSchema = z.object({
    type: z.literal("json_schema"),
    json_schema: z.object({
        name: z.string().max(64),
        description: z.string().optional(),
        schema: z.record(z.string(), z.unknown()).optional(),
        strict: z.boolean().optional(),
    }),
});

export const ResponseFormatJSONObjectSchema = z.object({
    type: z.literal("json_object"),
});

export const ResponseFormatSchema = z.union([
    ResponseFormatTextSchema,
    ResponseFormatJSONSchemaSchema,
    ResponseFormatJSONObjectSchema,
]);
export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;

// ====================
// Stream Options
// ====================

export const ChatCompletionStreamOptionsSchema = z.object({
    include_obfuscation: z.boolean().optional(),
    include_usage: z.boolean().optional(),
});
export type ChatCompletionStreamOptions = z.infer<typeof ChatCompletionStreamOptionsSchema>;

// ====================
// Web Search Options
// ====================

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

// ====================
// Error Types
// ====================

export const ErrorResponseSchema = z.object({
    error: z.object({
        message: z.string(),
        type: z.string(),
        code: z.string().optional(),
        param: z.string().optional(),
    }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// ====================
// URL Citation
// ====================

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

// ====================
// Re-exports from other common modules
// ====================

// URL citations
export { UrlCitationAnnotationSchema as UrlCitationSchema };
