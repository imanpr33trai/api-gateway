// src/converters/responses-to-openai.ts
// THE KEY CONVERTER: Responses API <-> OpenAI Chat Completions format
// This acts as middleware between the two API styles

import type { ChatCompletionRequest } from "../types/chat.js";
import type {
     ResponsesRequest,
     ResponsesResponse,
} from "../types/responses.js";

export interface ConverterOptions {
     modelMap?: Record<string, string>;
     defaultModel?: string;
}

/**
 * Main converter class for transforming between
 * Responses API format and OpenAI Chat Completions format.
 *
 * This is the middleware that enables:
 * - Responses API request -> OpenAI format (for providers like NVIDIA)
 * - OpenAI format response -> Responses API format (back to client)
 */
export class ResponsesToOpenAIConverter {
     private modelMap: Record<string, string>;
     private defaultModel: string;

     constructor(options: ConverterOptions = {}) {
          this.modelMap = options.modelMap || {};
          this.defaultModel =
               options.defaultModel || "meta/llama-3.3-70b-instruct";
     }

     /**
      * Convert Responses API request to OpenAI Chat Completions request.
      * Used when sending requests TO providers (like NVIDIA).
      */
     convertRequest(responsesReq: ResponsesRequest): ChatCompletionRequest {
          const messages: any[] = [];

          // Instructions become a system message
          if (responsesReq.instructions) {
               messages.push({
                    role: "system",
                    content: responsesReq.instructions,
               });
          }

          // Convert input to messages
          if (typeof responsesReq.input === "string") {
               messages.push({ role: "user", content: responsesReq.input });
          } else if (Array.isArray(responsesReq.input)) {
               let pendingThinking = "";

               for (const item of responsesReq.input) {
                    if (item.type === "reasoning") {
                         pendingThinking = item.encrypted_content || "";
                    } else if (!item.type || item.type === "message") {
                         const { role, content } =
                              this.convertInputMessage(item);
                         const msg: any = { role, content };

                         if (role === "assistant" && pendingThinking) {
                              msg.reasoning_content = pendingThinking;
                              pendingThinking = "";
                         }
                         messages.push(msg);
                    } else if (item.type === "function_call") {
                         const tc = {
                              id: item.call_id,
                              type: "function",
                              function: {
                                   name: item.name,
                                   arguments: item.arguments || "{}",
                              },
                         };

                         const last = messages[messages.length - 1];
                         if (last && last.role === "assistant") {
                              last.tool_calls = last.tool_calls || [];
                              last.tool_calls.push(tc);
                              if (pendingThinking) {
                                   last.reasoning_content = pendingThinking;
                                   pendingThinking = "";
                              }
                         } else {
                              const msg: any = {
                                   role: "assistant",
                                   tool_calls: [tc],
                              };
                              if (pendingThinking) {
                                   msg.reasoning_content = pendingThinking;
                                   pendingThinking = "";
                              }
                              messages.push(msg);
                         }
                    } else if (item.type === "function_call_output") {
                         const content =
                              typeof item.output === "string"
                                   ? item.output
                                   : JSON.stringify(item.output);
                         messages.push({
                              role: "tool",
                              content,
                              tool_call_id: item.call_id,
                         });
                    }
               }

               if (pendingThinking) {
                    messages.push({
                         role: "assistant",
                         content: "",
                         reasoning_content: pendingThinking,
                    });
               }
          }

          // Build the request
          const result: any = {
               model: this.mapModel(responsesReq.model),
               messages,
               stream: responsesReq.stream ?? false,
          };

          if (responsesReq.max_output_tokens)
               result.max_tokens = responsesReq.max_output_tokens;
          if (responsesReq.temperature !== undefined)
               result.temperature = responsesReq.temperature;
          if (responsesReq.top_p !== undefined)
               result.top_p = responsesReq.top_p;
          if (responsesReq.reasoning?.effort)
               result.reasoning_effort = responsesReq.reasoning.effort;

          // Text format
          if (responsesReq.text?.format) {
               if (
                    responsesReq.text.format.type === "json_schema" &&
                    responsesReq.text.format.schema
               ) {
                    result.response_format = {
                         type: "json_schema",
                         json_schema: {
                              schema: responsesReq.text.format.schema,
                              name: responsesReq.text.format.name,
                         },
                    };
               }
          }

          // Convert tools
          if (responsesReq.tools?.length) {
               result.tools = responsesReq.tools.map(
                    this.convertTool.bind(this),
               );
               result.tool_choice = responsesReq.tool_choice || "auto";
          }

          return result as ChatCompletionRequest;
     }

     /**
      * Convert OpenAI ChatCompletionResponse to ResponsesResponse.
      * Used when receiving responses FROM providers.
      */
     convertResponse(openaiResp: any, originalRequest: any): ResponsesResponse {
          const responseId = `resp_${this.generateId()}`;
          const choice = openaiResp.choices?.[0];

          if (!choice) {
               return {
                    id: responseId,
                    object: "response",
                    created_at: Math.floor(Date.now() / 1000),
                    status: "failed",
                    model: originalRequest.model,
                    output: [],
                    error: {
                         code: "no_choices",
                         message: "No response choices returned",
                    },
               } as any;
          }

          const output: any[] = [];
          const msg = choice.message;

          // Reasoning output
          const reasoningContent = msg.reasoning_content;
          if (reasoningContent) {
               output.push({
                    id: `reason_${this.generateId()}`,
                    type: "reasoning",
                    summary: [{ type: "summary_text", text: reasoningContent }],
                    encrypted_content: reasoningContent,
               });
          }

          // Tool calls
          if (msg.tool_calls?.length) {
               for (let i = 0; i < msg.tool_calls.length; i++) {
                    const tc = msg.tool_calls[i];
                    output.push({
                         id: `fc_${this.generateId()}_${i}`,
                         type: "function_call",
                         status: "completed",
                         call_id: tc.id,
                         name: tc.function.name,
                         arguments: tc.function.arguments,
                    });
               }
          }

          // Text output
          if (msg.content && (!msg.tool_calls || msg.tool_calls.length === 0)) {
               output.push({
                    id: `msg_${this.generateId()}`,
                    type: "message",
                    status: "completed",
                    role: "assistant",
                    content: [
                         {
                              type: "output_text",
                              text: msg.content,
                              annotations: [],
                              logprobs: [],
                         },
                    ],
               });
          }

          return {
               id: responseId,
               object: "response",
               created_at: Math.floor(Date.now() / 1000),
               completed_at: Math.floor(Date.now() / 1000),
               status: "completed",
               model: originalRequest.model,
               output,
               usage: openaiResp.usage
                    ? {
                           input_tokens: openaiResp.usage.prompt_tokens,
                           output_tokens: openaiResp.usage.completion_tokens,
                           total_tokens: openaiResp.usage.total_tokens,
                           input_tokens_details: { cached_tokens: 0 },
                           output_tokens_details: {
                                reasoning_tokens: reasoningContent
                                     ? openaiResp.usage.completion_tokens
                                     : 0,
                           },
                      }
                    : undefined,
               tools: originalRequest.tools,
               tool_choice: originalRequest.tool_choice || "auto",
               truncation: originalRequest.truncation || "disabled",
               top_p: originalRequest.top_p ?? 1.0,
               temperature: originalRequest.temperature ?? 1.0,
          } as any;
     }

     private mapModel(responsesModel: string): string {
          // Handle missing model
          if (!responsesModel) return this.defaultModel;

          // 1. Check explicit model map first
          if (this.modelMap[responsesModel])
               return this.modelMap[responsesModel];

          // 2. If it's already a valid provider-prefixed model, use it
          // But check if nvidia/ prefix - needs paid API key, fall back to default
          if (responsesModel.startsWith("nvidia/")) {
               console.log(
                    `[mapModel] ${responsesModel} has nvidia/ prefix, falling back to default: ${this.defaultModel}`,
               );
               return this.defaultModel;
          }

          if (responsesModel.includes("/")) return responsesModel;

          // 3. If it's a bare model name (no provider prefix), map it
          // Codex sends bare model names to ollama backend
          // Use our default (meta/llama-3.3-70b-instruct) which works with free tier
          return this.defaultModel;
     }

     private generateId(): string {
          return Math.random().toString(36).substring(2, 10);
     }

     private convertInputMessage(msg: any): { role: string; content: string } {
          const content = Array.isArray(msg.content)
               ? msg.content
                      .map((c: any) => {
                           if (typeof c === "string") return c;
                           if (
                                c.type === "input_text" ||
                                c.type === "output_text"
                           )
                                return c.text;
                           return "";
                      })
                      .join("")
               : msg.content;

          return { role: msg.role, content };
     }

     private convertTool(tool: any): any {
          return {
               type: "function",
               function: {
                    name: tool.name,
                    description: tool.description || undefined,
                    parameters: tool.parameters || undefined,
                    strict: tool.strict || undefined,
               },
          };
     }
}

export default ResponsesToOpenAIConverter;
