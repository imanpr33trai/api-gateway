// src/services/ollama.service.ts
/**
 * Ollama Conversion Service
 *
 * This service provides conversion functions between OpenAI API format
 * and Ollama's native API format, including support for the thinking/reasoning
 * feature (codex).
 *
 * Conversions:
 * - fromChatRequest: OpenAI ChatCompletion → Ollama ChatRequest
 * - toChatCompletion: Ollama ChatResponse → OpenAI ChatCompletion
 * - fromResponsesRequest: Responses API → Ollama ChatRequest
 * - toResponse: Ollama ChatResponse → Responses API
 */

import type {
     ChatCompletionChunk,
     ChatCompletionRequest,
     ChatCompletionResponse,
} from "../providers/types";
import type {
     ChatRequest as OllamaChatRequest,
     ChatResponse as OllamaChatResponse,
     Message as OllamaMessage,
     Tool as OllamaTool,
     ToolCall as OllamaToolCall,
     Options,
} from "../types/ollama.type";
import type {
     ResponsesInputItem,
     ResponsesOutputItem,
     ResponsesRequest,
     ResponsesResponse,
} from "../types/responses.types";
import { Role } from "../types/types";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert stop parameter to Ollama format
 */
function convertStop(
     stop: ChatCompletionRequest["stop"],
): string[] | undefined {
     if (!stop) return undefined;
     if (typeof stop === "string") return [stop];
     if (Array.isArray(stop))
          return stop.filter((s): s is string => typeof s === "string");
     return undefined;
}

/**
 * Convert tool definition from OpenAI format to Ollama format
 */
function convertToolDefinition(tool: any): OllamaTool {
     if (tool.type === "function" && tool.function) {
          return {
               type: "function",
               function: {
                    name: tool.function.name ?? undefined,
                    description: tool.function.description ?? undefined,
                    parameters:
                         (tool.function.parameters as Record<
                              string,
                              unknown
                         >) ?? undefined,
               },
          };
     }
     return tool as unknown as OllamaTool;
}

/**
 * Convert tool calls from OpenAI format to Ollama format
 */
function convertToolCalls(toolCalls: unknown): OllamaToolCall[] {
     if (!Array.isArray(toolCalls)) return [];

     return toolCalls
          .filter(
               (
                    tc,
               ): tc is {
                    id: string;
                    type: string;
                    function: {
                         name: string;
                         arguments: string | Record<string, unknown>;
                    };
               } =>
                    tc &&
                    typeof tc === "object" &&
                    ("type" in tc ? tc.type === "function" : true),
          )
          .map((tc: any) => ({
               function: {
                    name: tc.function?.name ?? "",
                    arguments:
                         typeof tc.function?.arguments === "string"
                              ? JSON.parse(tc.function.arguments)
                              : (tc.function?.arguments ?? {}),
               },
          }));
}

/**
 * Parse message content - handles string or array of content parts
 */
function parseMessageContent(
     content: ChatCompletionRequest["messages"][number]["content"],
): string {
     if (!content) return "";
     if (typeof content === "string") return content;
     if (Array.isArray(content)) {
          return content
               .filter(
                    (c): c is { type: "text"; text: string } =>
                         "text" in c && c.type === "text",
               )
               .map((c) => c.text)
               .join("");
     }
     return "";
}

/**
 * Get tool name for a given tool call ID
 */
function findToolNameForCallId(
     messages: ChatCompletionRequest["messages"],
     toolCallId: string,
): string | undefined {
     for (const msg of messages) {
          if ("tool_calls" in msg && msg.tool_calls) {
               const tc = msg.tool_calls.find((t) => t.id === toolCallId);
               if (tc && "function" in tc && tc.function) {
                    return tc.function.name;
               }
          }
     }
     return undefined;
}

// ============================================================================
// OpenAI Chat Completion ↔ Ollama Conversions
// ============================================================================

/**
 * Convert OpenAI ChatCompletion request to Ollama ChatRequest
 */
export function fromChatRequest(req: ChatCompletionRequest): OllamaChatRequest {
     const messages: OllamaMessage[] = [];

     for (const msg of req.messages) {
          const content = parseMessageContent(msg.content);

          switch (msg.role) {
               case "system": {
                    messages.push({
                         role: Role.SYSTEM,
                         content,
                    });
                    break;
               }

               case "user": {
                    messages.push({
                         role: Role.USER,
                         content,
                    });
                    break;
               }

               case "assistant": {
                    const toolCalls =
                         "tool_calls" in msg
                              ? convertToolCalls(msg.tool_calls)
                              : undefined;
                    messages.push({
                         role: Role.ASSISTANT,
                         content: content || "",
                         thinking:
                              "reasoning" in msg
                                   ? (msg as { reasoning?: string }).reasoning
                                   : undefined,
                         tool_calls: toolCalls,
                    } as OllamaMessage);
                    break;
               }

               case "tool": {
                    const toolCallId =
                         "tool_call_id" in msg
                              ? (msg as { tool_call_id?: string }).tool_call_id
                              : undefined;
                    messages.push({
                         role: Role.TOOL,
                         content: content || "",
                         tool_call_id: toolCallId,
                         tool_name: findToolNameForCallId(
                              req.messages,
                              toolCallId ?? "",
                         ),
                    } as OllamaMessage);
                    break;
               }

               default: {
                    messages.push({
                         role: Role.USER,
                         content,
                    });
               }
          }
     }

     // Build options
     const options: Partial<Options> = {};

     if (req.temperature !== undefined) {
          options.temperature = req.temperature;
     } else {
          options.temperature = 1.0;
     }

     if (req.top_p !== undefined) {
          options.top_p = req.top_p;
     }

     if (req.max_tokens !== undefined) {
          options.num_predict = req.max_tokens;
     }

     if (req.seed !== undefined) {
          options.seed = req.seed;
     }

     const stopSequences = convertStop(req.stop);
     if (stopSequences) {
          options.stop = stopSequences;
     }

     // Handle reasoning effort
     let think: boolean | "high" | "medium" | "low" | undefined;
     if (req.reasoning_effort) {
          if (req.reasoning_effort === "none") {
               think = false;
          } else {
               think = req.reasoning_effort as "high" | "medium" | "low";
          }
     }

     // Handle response format (JSON schema)
     let format: Record<string, unknown> | string | undefined;
     if (req.response_format) {
          if (
               req.response_format.type === "json_schema" &&
               req.response_format.json_schema
          ) {
               format = {
                    type: "json_schema",
                    name: req.response_format.json_schema.name,
                    schema: req.response_format.json_schema.schema,
                    strict: req.response_format.json_schema.strict,
               };
          } else if (req.response_format.type === "json_object") {
               format = { type: "json_object" };
          }
     }

     // Handle tools
     const tools = req.tools?.map((t: any) => convertToolDefinition(t));

     return {
          model: req.model,
          messages,
          stream: req.stream ?? false,
          options:
               Object.keys(options).length > 0
                    ? (options as Options)
                    : undefined,
          tools,
          think,
          format,
          logprobs: req.logprobs,
          top_logprobs: req.top_logprobs,
     };
}

/**
 * Convert Ollama ChatResponse to OpenAI ChatCompletion
 */
export function toChatCompletion(
     id: string,
     r: OllamaChatResponse,
): ChatCompletionResponse {
     const toolCalls = r.message.tool_calls?.map((tc, index) => ({
          id: `toolcall_${index}`,
          type: "function" as const,
          function: {
               name: tc.function.name ?? "",
               arguments:
                    typeof tc.function.arguments === "string"
                         ? tc.function.arguments
                         : JSON.stringify(tc.function.arguments ?? {}),
          },
     }));

     return {
          id,
          object: "chat.completion",
          created: new Date(r.created_at).getTime() / 1000,
          model: r.model,
          system_fingerprint: "fp_ollama",
          choices: [
               {
                    index: 0,
                    message: {
                         role: "assistant",
                         content: r.message.content ?? "",
                         refusal: null,
                         tool_calls: toolCalls,
                    },
                    finish_reason: r.done
                         ? toolCalls && toolCalls.length > 0
                              ? "tool_calls"
                              : "stop"
                         : "length",
                    logprobs: null,
               },
          ],
          usage: {
               prompt_tokens: r.prompt_eval_count,
               completion_tokens: r.eval_count,
               total_tokens: r.prompt_eval_count + r.eval_count,
          },
     };
}

/**
 * Convert Ollama ChatResponse to OpenAI ChatCompletionChunk (for streaming)
 */
export function toChatCompletionChunk(
     id: string,
     r: OllamaChatResponse,
     toolCallSent: boolean = false,
): ChatCompletionChunk {
     const toolCalls = r.message.tool_calls?.map((tc, index) => ({
          index,
          id: `toolcall_${index}`,
          type: "function" as const,
          function: {
               name: tc.function.name ?? "",
               arguments:
                    typeof tc.function.arguments === "string"
                         ? tc.function.arguments
                         : JSON.stringify(tc.function.arguments ?? {}),
          },
     }));

     const finishReason = r.done
          ? toolCallSent || (toolCalls && toolCalls.length > 0)
               ? "tool_calls"
               : "stop"
          : null;

     return {
          id,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: r.model,
          system_fingerprint: "fp_ollama",
          choices: [
               {
                    index: 0,
                    delta: {
                         role: "assistant",
                         content: r.message.content ?? "",
                    },
                    finish_reason: finishReason,
                    logprobs: null,
               },
          ],
          usage:
               r.prompt_eval_count || r.eval_count
                    ? {
                           prompt_tokens: r.prompt_eval_count,
                           completion_tokens: r.eval_count,
                           total_tokens: r.prompt_eval_count + r.eval_count,
                      }
                    : undefined,
     };
}

/**
 * Split a mixed response (thinking + content) into separate chunks for streaming
 */
export function toChatCompletionChunks(
     id: string,
     r: OllamaChatResponse,
     toolCallSent: boolean = false,
): ChatCompletionChunk[] {
     const hasMixedResponse =
          r.message.thinking &&
          (r.message.content ||
               (r.message.tool_calls && r.message.tool_calls.length > 0));

     if (!hasMixedResponse) {
          return [toChatCompletionChunk(id, r, toolCallSent)];
     }

     // Create reasoning chunk
     const reasoningChunk = toChatCompletionChunk(id, r, toolCallSent);
     reasoningChunk.choices[0]!.delta.content = r.message.thinking;
     reasoningChunk.choices[0]!.delta.tool_calls = undefined;
     reasoningChunk.choices[0]!.finish_reason = null;

     // Create content/tool calls chunk
     const contentChunk = toChatCompletionChunk(id, r, toolCallSent);
     contentChunk.created = reasoningChunk.created;
     contentChunk.choices[0]!.delta.content = r.message.content ?? "";
     contentChunk.choices[0]!.logprobs = null;

     return [reasoningChunk, contentChunk];
}

// ============================================================================
// Responses API ↔ Ollama Conversions
// ============================================================================

/**
 * Convert Responses API request to Ollama ChatRequest
 */
export function fromResponsesRequest(req: ResponsesRequest): OllamaChatRequest {
     const messages: OllamaMessage[] = [];

     // Add instructions as system message
     if (req.instructions) {
          messages.push({
               role: Role.SYSTEM,
               content: req.instructions,
          });
     }

     // Track pending reasoning to merge with assistant message
     let pendingThinking = "";

     // Handle input - can be string or array of items
     const items: ResponsesInputItem[] =
          typeof req.input === "string"
               ? [
                      {
                           type: "message" as const,
                           role: "user",
                           content: [
                                {
                                     type: "input_text" as const,
                                     text: req.input,
                                },
                           ],
                      },
                 ]
               : req.input;

     for (const item of items) {
          switch (item.type) {
               case "message": {
                    let content: string;
                    if (typeof item.content === "string") {
                         content = item.content;
                    } else if (Array.isArray(item.content)) {
                         content = item.content
                              .filter((c) => c.type === "input_text")
                              .map(
                                   (c) =>
                                        (
                                             c as {
                                                  type: "input_text";
                                                  text: string;
                                             }
                                        ).text,
                              )
                              .join("");
                    } else {
                         content = "";
                    }

                    // If there's pending thinking, attach to this assistant message
                    if (pendingThinking && item.role === "assistant") {
                         messages.push({
                              role: Role.ASSISTANT,
                              content: content || "",
                              thinking: pendingThinking,
                         } as OllamaMessage);
                         pendingThinking = "";
                    } else {
                         const role =
                              item.role === "assistant"
                                   ? Role.ASSISTANT
                                   : item.role === "user"
                                     ? Role.USER
                                     : Role.USER;

                         messages.push({
                              role,
                              content,
                         });
                    }
                    break;
               }

               case "function_call": {
                    const toolCall: OllamaToolCall = {
                         function: {
                              name: item.name,
                              arguments:
                                   item.arguments && item.arguments.trim()
                                        ? JSON.parse(item.arguments)
                                        : {},
                         },
                    };

                    // Merge into existing assistant message if it has content/tool calls
                    const lastMsg =
                         messages.length > 0
                              ? messages[messages.length - 1]
                              : null;
                    if (
                         lastMsg &&
                         lastMsg.role === Role.ASSISTANT &&
                         lastMsg.tool_calls
                    ) {
                         lastMsg.tool_calls = [...lastMsg.tool_calls, toolCall];
                         if (pendingThinking) {
                              lastMsg.thinking = pendingThinking;
                              pendingThinking = "";
                         }
                    } else {
                         const msg: OllamaMessage = {
                              role: Role.ASSISTANT,
                              content: "",
                              tool_calls: [toolCall],
                         };
                         if (pendingThinking) {
                              msg.thinking = pendingThinking;
                              pendingThinking = "";
                         }
                         messages.push(msg);
                    }
                    break;
               }

               case "function_call_output": {
                    messages.push({
                         role: Role.TOOL,
                         content: item.output,
                         tool_call_id: item.call_id,
                    } as OllamaMessage);
                    break;
               }

               case "reasoning": {
                    pendingThinking =
                         item.encrypted_content ??
                         item.summary?.[0]?.text ??
                         "";
                    break;
               }
          }
     }

     // If there's trailing reasoning without following message, emit it
     if (pendingThinking) {
          messages.push({
               role: Role.ASSISTANT,
               content: "",
               thinking: pendingThinking,
          } as OllamaMessage);
     }

     // Build options
     const options: Partial<Options> = {};

     if (req.temperature !== undefined) {
          options.temperature = req.temperature;
     } else {
          options.temperature = 1.0;
     }

     if (req.top_p !== undefined) {
          options.top_p = req.top_p;
     }

     if (req.max_output_tokens !== undefined) {
          options.num_predict = req.max_output_tokens;
     }

     // Handle reasoning effort
     let think: boolean | "high" | "medium" | "low" | undefined;
     if (req.reasoning?.effort) {
          if (req.reasoning.effort === "none") {
               think = false;
          } else {
               think = req.reasoning.effort as "high" | "medium" | "low";
          }
     }

     // Convert tools
     const tools: OllamaTool[] | undefined = req.tools?.map((t) => ({
          type: t.type,
          function: {
               name: t.name ?? undefined,
               description: t.description ?? undefined,
               parameters: t.parameters,
          },
     }));

     // Handle text format (JSON schema)
     let format: Record<string, unknown> | string | undefined;
     if (req.text?.format) {
          if (
               req.text.format.type === "json_schema" &&
               req.text.format.schema
          ) {
               format = {
                    type: "json_schema",
                    name: req.text.format.name,
                    schema: req.text.format.schema,
                    strict: req.text.format.strict,
               };
          }
     }

     return {
          model: req.model,
          messages,
          stream: req.stream ?? false,
          options:
               Object.keys(options).length > 0
                    ? (options as Options)
                    : undefined,
          tools,
          think,
          format,
     };
}

/**
 * Convert Ollama ChatResponse to Responses API response
 */
export function toResponse(
     model: string,
     responseId: string,
     itemId: string,
     chatResponse: OllamaChatResponse,
     request: ResponsesRequest,
): ResponsesResponse {
     const output: ResponsesOutputItem[] = [];

     // Add reasoning item if thinking is present
     if (chatResponse.message.thinking) {
          output.push({
               id: `rs_${responseId}`,
               type: "reasoning",
               summary: [
                    {
                         type: "summary_text",
                         text: chatResponse.message.thinking,
                    },
               ],
               encrypted_content: chatResponse.message.thinking,
          });
     }

     // Handle tool calls
     if (
          chatResponse.message.tool_calls &&
          chatResponse.message.tool_calls.length > 0
     ) {
          chatResponse.message.tool_calls.forEach((tc, index) => {
               output.push({
                    id: `fc_${responseId}_${index}`,
                    type: "function_call",
                    status: "completed",
                    call_id: `call_${responseId}_${index}`,
                    name: tc.function.name ?? "",
                    arguments:
                         typeof tc.function.arguments === "string"
                              ? tc.function.arguments
                              : JSON.stringify(tc.function.arguments ?? {}),
               });
          });
     } else {
          // Regular message content
          output.push({
               id: itemId,
               type: "message",
               status: "completed",
               role: "assistant",
               content: [
                    {
                         type: "output_text",
                         text: chatResponse.message.content ?? "",
                         annotations: [],
                         logprobs: [],
                    },
               ],
          });
     }

     return {
          id: responseId,
          object: "response",
          created_at: Math.floor(
               new Date(chatResponse.created_at).getTime() / 1000,
          ),
          completed_at: Math.floor(Date.now() / 1000),
          status: "completed",
          model,
          output,
          tools: request.tools ?? [],
          tool_choice: request.tool_choice ?? "auto",
          truncation: request.truncation ?? "disabled",
          parallel_tool_calls: request.parallel_tool_calls ?? true,
          text: request.text
               ? { format: request.text.format ?? { type: "text" } }
               : { format: { type: "text" } },
          top_p: request.top_p ?? 1.0,
          temperature: request.temperature ?? 1.0,
          usage: {
               input_tokens: chatResponse.prompt_eval_count,
               output_tokens: chatResponse.eval_count,
               total_tokens:
                    chatResponse.prompt_eval_count + chatResponse.eval_count,
               input_tokens_details: { cached_tokens: 0 },
               output_tokens_details: { reasoning_tokens: 0 },
          },
          max_output_tokens: request.max_output_tokens ?? null,
          background: request.background ?? false,
     };
}

// ============================================================================
// Streaming Helpers
// ============================================================================

/**
 * Convert Ollama stream event to SSE format for OpenAI compatibility
 */
export function ollamaToSSEMessage(chunk: ChatCompletionChunk): string {
     const data = JSON.stringify(chunk);
     return `data: ${data}\n\n`;
}

/**
 * Create the final [DONE] SSE message
 */
export function createSSEDone(): string {
     return "data: [DONE]\n\n";
}

/**
 * Create error SSE message
 */
export function createSSEError(error: string): string {
     return `data: ${JSON.stringify({ error })}\n\n`;
}
