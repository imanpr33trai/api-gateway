import { z } from "zod";
import { Role } from "./types";

export type Fetch = typeof fetch;

/* -----------------------------------------------------------------
   Core / utility schemas
   ----------------------------------------------------------------- */
export const ConfigSchema = z.object({
     host: z.string(),
     fetch: z.function().optional(),
     proxy: z.boolean().optional(),
     headers: z.any().optional(),
});

/* -----------------------------------------------------------------
   Options – already existed in this file, kept unchanged
   ----------------------------------------------------------------- */
export const OptionsSchema = z.object({
     numa: z.boolean(),
     num_ctx: z.number(),
     num_batch: z.number(),
     num_gpu: z.number(),
     main_gpu: z.number(),
     low_vram: z.boolean(),
     f16_kv: z.boolean(),
     logits_all: z.boolean(),
     vocab_only: z.boolean(),
     use_mmap: z.boolean(),
     use_mlock: z.boolean(),
     embedding_only: z.boolean(),
     num_thread: z.number(),

     // Runtime options
     num_keep: z.number(),
     seed: z.number(),
     num_predict: z.number(),
     top_k: z.number(),
     top_p: z.number(),
     min_p: z.number(),
     tfs_z: z.number(),
     typical_p: z.number(),
     repeat_last_n: z.number(),
     temperature: z.number(),
     repeat_penalty: z.number(),
     presence_penalty: z.number(),
     frequency_penalty: z.number(),
     mirostat: z.number(),
     mirostat_tau: z.number(),
     mirostat_eta: z.number(),
     penalize_newline: z.boolean(),
     stop: z.array(z.string()),
});

/* -----------------------------------------------------------------
   Request schemas
   ----------------------------------------------------------------- */
export const GenerateRequestSchema = z.object({
     model: z.string(),
     prompt: z.string(),
     suffix: z.string().optional(),
     system: z.string().optional(),
     template: z.string().optional(),
     context: z.array(z.number()).optional(),
     stream: z.boolean().optional(),
     raw: z.boolean().optional(),
     format: z.union([z.string(), z.object({}).passthrough()]).optional(),
     images: z
          .array(z.union([z.string(), z.instanceof(Uint8Array)]))
          .optional(),
     keep_alive: z.union([z.string(), z.number()]).optional(),
     think: z
          .union([
               z.boolean(),
               z.literal("high"),
               z.literal("medium"),
               z.literal("low"),
          ])
          .optional(),
     logprobs: z.boolean().optional(),
     top_logprobs: z.number().optional(),
     width: z.number().optional(),
     height: z.number().optional(),
     steps: z.number().optional(),

     options: OptionsSchema.partial().optional(),
});

export const MessageSchema = z.object({
     role: z.enum(Role),
     content: z.string(),
     thinking: z.string().optional(),
     images: z
          .array(z.union([z.string(), z.instanceof(Uint8Array)]))
          .optional(),
     tool_calls: z.array(z.lazy(() => ToolCallSchema)).optional(),
     tool_name: z.string().optional(),
});

export const ToolCallSchema = z.object({
     function: z.object({
          name: z.string(),
          arguments: z.record(z.string(), z.any()),
     }),
});
const PropertySchema = z.object({
     type: z.union([z.string(), z.array(z.string())]).optional(),
     items: z.any().optional(),
     description: z.string().optional(),
     enum: z.array(z.any()).optional(),
});
export const ToolSchema = z
     .object({
          type: z.string(),
          function: z
               .object({
                    name: z.string().optional(),
                    description: z.string().optional(),
                    parameters: z
                         .object({
                              type: z.string().optional(),
                              $defs: z.any().optional(),
                              items: z.any().optional(),
                              required: z.array(z.string()).optional(),
                              properties: z
                                   .record(
                                        z.string(),
                                        PropertySchema.optional(),
                                   )
                                   .optional(),
                         })
                         .optional(),
               })
               .optional(),
     })
     .optional();

export const ChatRequestSchema = z.object({
     model: z.string(),

     messages: z.array(MessageSchema).optional(),
     stream: z.boolean().optional(),
     format: z.union([z.string(), z.object({}).loose()]).optional(),
     keep_alive: z.union([z.string(), z.number()]).optional(),
     tools: z.array(ToolSchema).optional(),
     think: z
          .union([
               z.boolean(),
               z.literal("high"),
               z.literal("medium"),
               z.literal("low"),
          ])
          .optional(),
     logprobs: z.boolean().optional(),
     top_logprobs: z.number().optional(),
     options: OptionsSchema.partial().optional(),
});

export const PullRequestSchema = z.object({
     model: z.string(),
     insecure: z.boolean().optional(),
     stream: z.boolean().optional(),
});

export const PushRequestSchema = z.object({
     model: z.string(),
     insecure: z.boolean().optional(),
     stream: z.boolean().optional(),
});

export const CreateRequestSchema = z.object({
     model: z.string(),
     from: z.string().optional(),
     stream: z.boolean().optional(),
     quantize: z.string().optional(),
     template: z.string().optional(),
     license: z.union([z.string(), z.array(z.string())]).optional(),
     system: z.string().optional(),
     parameters: z.record(z.string(), z.unknown()).optional(),
     messages: z.array(MessageSchema).optional(),
     adapters: z.record(z.string(), z.string()).optional(),
});

export const DeleteRequestSchema = z.object({
     model: z.string(),
});

export const CopyRequestSchema = z.object({
     source: z.string(),
     destination: z.string(),
});

export const ShowRequestSchema = z.object({
     model: z.string(),
     system: z.string().optional(),
     template: z.string().optional(),
     options: OptionsSchema.partial().optional(),
});

export const EmbedRequestSchema = z.object({
     model: z.string(),
     input: z.union([z.string(), z.array(z.string())]),
     truncate: z.boolean().optional(),
     keep_alive: z.union([z.string(), z.number()]).optional(),
     dimensions: z.number().optional(),
     options: OptionsSchema.partial().optional(),
});

export const EmbeddingsRequestSchema = z.object({
     model: z.string(),
     prompt: z.string(),
     keep_alive: z.union([z.string(), z.number()]).optional(),
     options: OptionsSchema.partial().optional(),
});

/* -----------------------------------------------------------------
   Response / auxiliary schemas
   ----------------------------------------------------------------- */
export const TokenLogprobSchema = z.object({
     token: z.string(),
     logprob: z.number(),
});

export const LogprobSchema = TokenLogprobSchema.extend({
     top_logprobs: z.array(z.string()).optional(),
});

export const GenerateResponseSchema = z.object({
     model: z.string(),
     created_at: z.string(), // Keep as string to match JSON serialization
     response: z.string().optional(),
     thinking: z.string().optional(),
     done: z.boolean(),
     done_reason: z.string(),
     context: z.array(z.number()),
     total_duration: z.number(),
     load_duration: z.number(),
     prompt_eval_count: z.number(),
     prompt_eval_duration: z.number(),
     eval_count: z.number(),
     eval_duration: z.number(),
     logprobs: z.array(LogprobSchema).optional(),
     // image-generation fields
     image: z.string().optional(),
     completed: z.number().optional(),
     total: z.number().optional(),
});

export const ChatResponseSchema = z.object({
     model: z.string(),
     created_at: z.string(), // Keep as string
     message: MessageSchema,
     done: z.boolean(),
     done_reason: z.string(),
     total_duration: z.number(),
     load_duration: z.number(),
     prompt_eval_count: z.number(),
     prompt_eval_duration: z.number(),
     eval_count: z.number(),
     eval_duration: z.number(),
     logprobs: z.array(LogprobSchema).optional(),
});

export const EmbedResponseSchema = z.object({
     model: z.string(),
     embeddings: z.array(z.array(z.number())),
     total_duration: z.number(),
     load_duration: z.number(),
     prompt_eval_count: z.number(),
});

export const EmbeddingsResponseSchema = z.object({
     embedding: z.array(z.number()),
});

export const ProgressResponseSchema = z.object({
     status: z.string(),
     digest: z.string(),
     total: z.number(),
     completed: z.number(),
});

export const ModelDetailsSchema = z.object({
     parent_model: z.string(),
     format: z.string(),
     family: z.string(),
     families: z.array(z.string().array()).optional(),
     parameter_size: z.string(),
     quantization_level: z.string(),
});

export const ModelResponseSchema = z.object({
     name: z.string(),
     modified_at: z.string(), // Keep as string
     model: z.string(),
     size: z.number(),
     digest: z.string(),
     details: ModelDetailsSchema,
     expires_at: z.string(), // Keep as string
     size_vram: z.number(),
});

export const ShowResponseSchema = z.object({
     license: z.string(),
     modelfile: z.string(),
     parameters: z.string(),
     template: z.string(),
     system: z.string(),
     details: ModelDetailsSchema,
     messages: z.array(MessageSchema).optional(),
     modified_at: z.string(), // Keep as string
     model_info: z.map(z.string(), z.any()).optional(),
     capabilities: z.array(z.string()),
     projector_info: z.map(z.string(), z.any()).optional(),
});

export const VersionResponseSchema = z.object({
     version: z.string(),
});

export const ListResponseSchema = z.object({
     models: z.array(ModelResponseSchema),
});

export const ErrorResponseSchema = z.object({
     error: z.string(),
});

export const StatusResponseSchema = z.object({
     status: z.string(),
});

export const WebSearchRequestSchema = z.object({
     query: z.string(),
     maxResults: z.number().optional(),
});

export const WebSearchResultSchema = z.object({
     content: z.string(),
});

export const WebSearchResponseSchema = z.object({
     results: z.array(WebSearchResultSchema),
});

export const WebFetchRequestSchema = z.object({
     url: z.string(),
});

export const WebFetchResponseSchema = z.object({
     title: z.string(),
     url: z.string(),
     content: z.string(),
     links: z.array(z.string()),
});

/* -----------------------------------------------------------------
   Types derived from the schemas – convenient for the rest of the code
   ----------------------------------------------------------------- */
export type Config = z.infer<typeof ConfigSchema>;
export type Options = z.infer<typeof OptionsSchema>;
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
export type Tool = z.infer<typeof ToolSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export type PullRequest = z.infer<typeof PullRequestSchema>;
export type PushRequest = z.infer<typeof PushRequestSchema>;
export type CreateRequest = z.infer<typeof CreateRequestSchema>;
export type DeleteRequest = z.infer<typeof DeleteRequestSchema>;
export type CopyRequest = z.infer<typeof CopyRequestSchema>;
export type ShowRequest = z.infer<typeof ShowRequestSchema>;

export type EmbedRequest = z.infer<typeof EmbedRequestSchema>;
export type EmbeddingsRequest = z.infer<typeof EmbeddingsRequestSchema>;

export type TokenLogprob = z.infer<typeof TokenLogprobSchema>;
export type Logprob = z.infer<typeof LogprobSchema>;

export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
export type EmbedResponse = z.infer<typeof EmbedResponseSchema>;
export type EmbeddingsResponse = z.infer<typeof EmbeddingsResponseSchema>;

export type ProgressResponse = z.infer<typeof ProgressResponseSchema>;
export type ModelDetails = z.infer<typeof ModelDetailsSchema>;
export type ModelResponse = z.infer<typeof ModelResponseSchema>;
export type ShowResponse = z.infer<typeof ShowResponseSchema>;

export type VersionResponse = z.infer<typeof VersionResponseSchema>;
export type ListResponse = z.infer<typeof ListResponseSchema>;

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type StatusResponse = z.infer<typeof StatusResponseSchema>;

export type WebSearchRequest = z.infer<typeof WebSearchRequestSchema>;
export type WebSearchResult = z.infer<typeof WebSearchResultSchema>;
export type WebSearchResponse = z.infer<typeof WebSearchResponseSchema>;

export type WebFetchRequest = z.infer<typeof WebFetchRequestSchema>;
export type WebFetchResponse = z.infer<typeof WebFetchResponseSchema>;
