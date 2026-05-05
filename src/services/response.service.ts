import { z } from "zod";
import { Nvidia } from "../providers/nvidia";
import { ChatCompletionRequestSchema } from "../providers/types";

type ChatCompletionRequestInput = z.input<typeof ChatCompletionRequestSchema>;

// ============= Request Types =============

const ContentItemSchema = z.union([
     z.object({
          type: z.literal("text"),
          text: z.string(),
     }),
     z.object({
          type: z.literal("image"),
          source: z.object({
               type: z.enum(["base64", "url"]),
               media_type: z.string(),
               data: z.string(),
          }),
     }),
     z.object({
          type: z.literal("tool_use"),
          id: z.string(),
          name: z.string(),
          input: z.record(z.string(), z.unknown()),
     }),
     z.object({
          type: z.literal("tool_result"),
          tool_use_id: z.string(),
          content: z.string(),
          is_error: z.boolean().optional(),
     }),
     z.object({
          type: z.literal("reasoning"),
          reasoning: z.string(),
     }),
]);

const ResponseItemSchema = z.object({
     type: z.enum([
          "message",
          "function_tool_call",
          "text",
          "image",
          "input",
          "reasoning",
     ]),
     id: z.string(),
     status: z.enum(["in_progress", "completed", "incomplete"]),
     content: z.array(ContentItemSchema).optional(),
     role: z.enum(["user", "assistant"]).optional(),
     name: z.string().optional(),
     toolCalls: z
          .array(
               z.object({
                    id: z.string(),
                    type: z.literal("function"),
                    function: z.object({
                         name: z.string(),
                         arguments: z.string(),
                    }),
               }),
          )
          .optional(),
     toolCallId: z.string().optional(),
     outputIndex: z.number().optional(),
     responseId: z.string().optional(),
});

const ToolSchema = z.object({
     type: z.literal("function"),
     function: z.object({
          name: z.string(),
          description: z.string().optional(),
          parameters: z.record(z.string(), z.unknown()).optional(),
     }),
});

const ReasoningSchema = z.object({
     effort: z.enum(["low", "medium", "high"]).optional(),
     summary: z
          .object({
               effort: z.enum(["auto", "low", "medium", "high"]).optional(),
          })
          .optional(),
});

const TextControlsSchema = z.object({
     verbosity: z.enum(["low", "medium", "high"]).optional(),
     format: z
          .object({
               type: z.literal("json_schema"),
               strict: z.boolean(),
               schema: z.record(z.string(), z.unknown()),
               name: z.string(),
          })
          .optional(),
});

export const CodexRequestSchema = z.object({
     model: z.string(),
     instructions: z.string().optional().default(""),
     input: z.array(ResponseItemSchema),
     tools: z.array(ToolSchema).optional().default([]),
     tool_choice: z.string().optional().default("auto"),
     parallel_tool_calls: z.boolean().optional().default(true),
     reasoning: ReasoningSchema.optional(),
     store: z.boolean().optional().default(false),
     stream: z.boolean().optional().default(true),
     include: z.array(z.string()).optional().default(["content.text"]),
     service_tier: z.string().optional(),
     prompt_cache_key: z.string().optional(),
     text: TextControlsSchema.optional(),
     client_metadata: z.record(z.string(), z.string()).optional(),
});

export type CodexRequest = z.infer<typeof CodexRequestSchema>;

// ============= Response Types =============

export interface CodexTextContent {
     type: "text";
     text: string;
}

export interface CodexMessageOutput {
     id: string;
     type: "message";
     status: "completed";
     role: "assistant";
     content: CodexTextContent[];
}

export interface CodexResponse {
     type: "response.create";
     response_id: string;
     model: string;
     output: CodexMessageOutput[];
     usage: {
          input_tokens: number;
          output_tokens: number;
          total_tokens: number;
     };
}

export interface CodexStreamEvent {
     type: string;
     response_id?: string;
     output?: CodexMessageOutput[];
     delta?: string;
     usage?: CodexResponse["usage"];
}

// ============= Helper Functions =============

function CodexRequestToChatRequest(
     req: CodexRequest,
): ChatCompletionRequestInput {
     const messages: ChatCompletionRequestInput["messages"] = [];

     // Add system instruction if provided
     if (req.instructions) {
          messages.push({
               role: "system",
               content: req.instructions,
          });
     }

     // Convert Codex input items to chat messages
     for (const item of req.input) {
          if (item.type !== "message") continue;

          const content =
               // If the first content item is a text part, use its text directly.
               // Otherwise, concatenate all text parts (ignore non‑text items).
               (() => {
                    const first = item.content?.[0];
                    if (first && first.type === "text") {
                         return first.text;
                    }
                    return (
                         item.content
                              ?.map((c) => (c.type === "text" ? c.text : ""))
                              .join("") ?? ""
                    );
               })();

          messages.push({
               role: item.role as "user" | "assistant",
               content,
          });
     }

     // Convert tools to functions format
     const functions = req.tools?.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
     }));

     // Build the request - using Omit to pick only what we need
     const baseRequest = {
          model: req.model,
          messages,
          stream: req.stream ?? true,
     } satisfies Omit<ChatCompletionRequestInput, "messages"> & {
          messages: typeof messages;
     };

     // Add optional fields conditionally
     if (functions?.length) {
          return { ...baseRequest, functions } as ChatCompletionRequestInput;
     }
     if (req.parallel_tool_calls) {
          return {
               ...baseRequest,
               parallel_tool_calls: req.parallel_tool_calls,
          } as ChatCompletionRequestInput;
     }
     if (req.reasoning?.effort) {
          return {
               ...baseRequest,
               reasoning_effort: req.reasoning.effort,
          } as ChatCompletionRequestInput;
     }

     return baseRequest as ChatCompletionRequestInput;
}

// ============= Service Functions =============

/**
 * Non-streaming response completion.
 */
export async function responseCompletion(
     req: CodexRequest,
): Promise<CodexResponse> {
     const validated = CodexRequestSchema.parse(req);
     const chatReq = CodexRequestToChatRequest({ ...validated, stream: false });

     // Validate against the schema before sending
     const validatedChatReq = ChatCompletionRequestSchema.parse(chatReq);

     const response = await Nvidia.chat(validatedChatReq);

     if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          throw new Error(`Provider error ${response.status}: ${errorBody}`);
     }

     const json = await response.json();

     // Convert Nvidia response to Codex response format
     const choice = json.choices?.[0];
     const message = choice?.message;

     return {
          type: "response.create",
          response_id: json.id ?? `resp_${Date.now()}`,
          model: json.model,
          output: message
               ? [
                      {
                           id: json.id ?? `msg_${Date.now()}`,
                           type: "message" as const,
                           status: "completed" as const,
                           role: "assistant",
                           content: message.content
                                ? [
                                       {
                                            type: "text" as const,
                                            text: message.content,
                                       },
                                  ]
                                : [],
                      },
                 ]
               : [],
          usage: json.usage ?? {
               input_tokens: 0,
               output_tokens: 0,
               total_tokens: 0,
          },
     };
}

/**
 * Streaming response completion.
 * Returns the raw provider Response (body is a ReadableStream).
 */
export async function responseCompletionStream(
     req: CodexRequest,
): Promise<Response> {
     const validated = CodexRequestSchema.parse(req);
     const chatReq = CodexRequestToChatRequest({ ...validated, stream: true });

     // Validate against the schema before sending
     const validatedChatReq = ChatCompletionRequestSchema.parse(chatReq);

     const response = await Nvidia.chat(validatedChatReq);

     if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          throw new Error(`Provider error ${response.status}: ${errorBody}`);
     }

     return response;
}
