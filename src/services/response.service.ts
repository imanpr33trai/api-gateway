// src/services/response.service.ts
import { z } from "zod";
import { Nvidia } from "../providers/nvidia";
import { Ollama } from "../providers/ollama";
import { ChatCompletionRequestSchema } from "../providers/types";
import type { ChatResponse } from "../types/ollama";
import {
     ResponsesRequestSchema,
     ResponsesResponseSchema,
     type ResponsesInputItem,
     type ResponsesOutputItem,
     type ResponsesRequest,
     type ResponsesResponse,
} from "../types/responses";

// Provider type for responses endpoint
export type ResponsesProvider = "nvidia" | "ollama";

// Get provider from environment or default to nvidia
function getResponsesProvider(): ResponsesProvider {
     const provider = process.env.RESPONSES_PROVIDER?.toLowerCase();
     if (provider === "ollama") return "ollama";
     return "nvidia";
}

// -------------------------------------------------------------------
// Convert a Responses API request to Ollama Chat format (for Ollama provider)
// -------------------------------------------------------------------
function responsesToOllamaChatRequest(req: ResponsesRequest): {
     model: string;
     messages: any[];
     tools?: any[];
     temperature?: number;
     top_p?: number;
     max_tokens?: number;
     reasoning_effort?: string;
     format?: any;
     think?: boolean | string;
} {
     const messages: any[] = [];

     // System instructions
     if (req.instructions) {
          messages.push({ role: "system", content: req.instructions });
     }

     // Input can be a plain string (user turn) or an array of items
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
                    // content may be a string (shorthand) or array of content parts
                    let content: string;
                    let images: string[] | undefined;

                    if (typeof item.content === "string") {
                         content = item.content;
                    } else if (Array.isArray(item.content)) {
                         content = item.content
                              .filter((c) => c.type === "input_text")
                              .map((c) => c.text)
                              .join("");

                         // Handle images
                         const imageParts = item.content.filter(
                              (c) => c.type === "input_image",
                         );
                         if (imageParts.length > 0) {
                              images = imageParts
                                   .map((c: any) => {
                                        const url =
                                             c.image_url?.url ||
                                             c.image_url ||
                                             "";
                                        // Extract base64 data if present
                                        const base64Match = url.match(
                                             /^data:image\/\w+;base64,(.+)$/,
                                        );
                                        return base64Match
                                             ? base64Match[1]
                                             : url;
                                   })
                                   .filter(Boolean);
                         }
                    } else {
                         content = "";
                    }

                    const msg: any = { role: item.role, content };
                    if (images && images.length > 0) {
                         msg.images = images;
                    }
                    messages.push(msg);
                    break;
               }

               case "function_call": {
                    // assistant message with tool call
                    messages.push({
                         role: "assistant",
                         content: "",
                         tool_calls: [
                              {
                                   id: item.call_id,
                                   type: "function",
                                   function: {
                                        name: item.name,
                                        arguments:
                                             typeof item.arguments === "string"
                                                  ? JSON.parse(item.arguments)
                                                  : item.arguments,
                                   },
                              },
                         ],
                    });
                    break;
               }

               case "function_call_output": {
                    messages.push({
                         role: "tool",
                         content: item.output,
                         tool_call_id: item.call_id,
                    });
                    break;
               }

               case "reasoning": {
                    messages.push({
                         role: "assistant",
                         content: "",
                         thinking: item.encrypted_content ?? "",
                    });
                    break;
               }
          }
     }

     // Handle reasoning effort
     let think: boolean | string = false;
     if (req.reasoning?.effort) {
          const effort = req.reasoning.effort;
          if (effort === "none") {
               think = false;
          } else if (effort === "high") {
               think = "high";
          } else {
               think = effort;
          }
     }

     // Handle text format
     let format: any = undefined;
     if (req.text?.format) {
          if (req.text.format.type === "json_schema") {
               format = {
                    type: "json_schema",
                    json_schema: req.text.format.schema,
               };
          } else if (req.text.format.type === "json_object") {
               format = { type: "json_object" };
          }
     }

     return {
          model: req.model,
          messages,
          temperature: req.temperature,
          top_p: req.top_p,
          max_tokens: req.max_output_tokens,
          tools: req.tools,
          reasoning_effort: req.reasoning?.effort,
          format,
          think,
     } as any;
}

// -------------------------------------------------------------------
// Convert Ollama Chat response to Responses API response
// -------------------------------------------------------------------
function ollamaChatToResponses(
     request: ResponsesRequest,
     responseId: string,
     ollamaResponse: ChatResponse,
): ResponsesResponse {
     const message = ollamaResponse.message;

     const output: ResponsesOutputItem[] = [];

     if (message) {
          // If tool calls present, emit function_call items
          if (message.tool_calls && message.tool_calls.length > 0) {
               for (let i = 0; i < message.tool_calls.length; i++) {
                    const tc = message.tool_calls[i];
                    output.push({
                         id: `fc_${responseId}_${i}`,
                         type: "function_call",
                         status: "completed",
                         call_id: tc.id || `call_${Date.now()}_${i}`,
                         name: tc.function.name,
                         arguments:
                              typeof tc.function.arguments === "string"
                                   ? tc.function.arguments
                                   : JSON.stringify(tc.function.arguments),
                    } as any);
               }
          } else if (message.content || message.thinking) {
               const outputItem: any = {
                    id: `msg_${responseId}`,
                    type: "message",
                    status: "completed",
                    role: "assistant",
                    content: [],
               };

               // Add thinking first if present
               if (message.thinking) {
                    outputItem.content.push({
                         type: "reasoning" as const,
                         reasoning: message.thinking,
                    });
               }

               // Add text content
               if (message.content) {
                    outputItem.content.push({
                         type: "output_text",
                         text: message.content,
                         annotations: [],
                         logprobs: [],
                    });
               }

               output.push(outputItem);
          }
     }

     // Extract usage from Ollama metrics
     const usage = {
          input_tokens: ollamaResponse.prompt_eval_count ?? 0,
          output_tokens: ollamaResponse.eval_count ?? 0,
          total_tokens:
               (ollamaResponse.prompt_eval_count ?? 0) +
               (ollamaResponse.eval_count ?? 0),
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: {
               reasoning_tokens: message?.thinking
                    ? (ollamaResponse.eval_count ?? 0)
                    : 0,
          },
     };

     return ResponsesResponseSchema.parse({
          id: responseId,
          object: "response",
          created_at: Math.floor(Date.now() / 1000),
          completed_at: Math.floor(Date.now() / 1000),
          status: "completed",
          incomplete_details: null,
          model: ollamaResponse.model ?? request.model,
          previous_response_id: null,
          instructions: request.instructions ?? null,
          output,
          error: null,
          tools: request.tools ?? [],
          tool_choice: "auto",
          truncation: request.truncation ?? "disabled",
          parallel_tool_calls: request.parallel_tool_calls ?? true,
          text: { format: request.text?.format ?? { type: "text" } },
          top_p: request.top_p ?? 1.0,
          presence_penalty: 0,
          frequency_penalty: 0,
          top_logprobs: 0,
          temperature: request.temperature ?? 1.0,
          reasoning: request.reasoning
               ? {
                      effort: request.reasoning.effort ?? null,
                      summary: request.reasoning.summary ?? null,
                 }
               : null,
          usage,
          max_output_tokens: request.max_output_tokens ?? null,
          max_tool_calls: null,
          store: false,
          background: request.background ?? false,
          service_tier: request.service_tier ?? "default",
          metadata: {},
          safety_identifier: null,
          prompt_cache_key: null,
     });
}

// ---------------------------------------------------------------------------
// Convert a Responses API request to an OpenAI Chat Completions request
// ---------------------------------------------------------------------------
function responsesToChatRequest(
     req: ResponsesRequest,
): z.input<typeof ChatCompletionRequestSchema> {
     const messages: any[] = [];

     // System instructions
     if (req.instructions) {
          messages.push({ role: "system", content: req.instructions });
     }

     // Input can be a plain string (user turn) or an array of items
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
                    // content may be a string (shorthand) or array of content parts
                    let content: string;
                    if (typeof item.content === "string") {
                         content = item.content;
                    } else if (Array.isArray(item.content)) {
                         content = item.content
                              .filter((c) => c.type === "input_text")
                              .map((c) => c.text)
                              .join("");
                    } else {
                         content = "";
                    }
                    messages.push({ role: item.role, content });
                    break;
               }

               case "function_call": {
                    // assistant message with tool call
                    messages.push({
                         role: "assistant",
                         content: null,
                         tool_calls: [
                              {
                                   id: item.call_id,
                                   type: "function",
                                   function: {
                                        name: item.name,
                                        arguments: item.arguments,
                                   },
                              },
                         ],
                    });
                    break;
               }

               case "function_call_output": {
                    messages.push({
                         role: "tool",
                         content: item.output,
                         tool_call_id: item.call_id,
                    });
                    break;
               }

               // reasoning is an internal representation; we store it as assistant message with thinking
               case "reasoning": {
                    messages.push({
                         role: "assistant",
                         content: null,
                         thinking: item.encrypted_content ?? "",
                    });
                    break;
               }
          }
     }

     return {
          model: req.model,
          messages,
          stream: req.stream ?? false,
          temperature: req.temperature ?? 1.0,
          max_tokens: req.max_output_tokens,
          top_p: req.top_p ?? 1.0,
          tools: req.tools
               ?.filter((t) => t.name)
               .map((t) => ({
                    type: t.type,
                    function: {
                         name: t.name,
                         description: t.description ?? undefined,
                         parameters: t.parameters,
                    },
               })),
          reasoning_effort: req.reasoning?.effort,
     };
}

// ---------------------------------------------------------------------------
// Convert a full OpenAI Chat Completions response to ResponsesResponse
// ---------------------------------------------------------------------------
function chatCompletionToResponses(
     request: ResponsesRequest,
     responseId: string,
     completion: any,
): ResponsesResponse {
     const choice = completion.choices?.[0];
     const message = choice?.message;

     const output: ResponsesOutputItem[] = [];

     if (message) {
          // If tool calls present, emit function_call items
          if (message.tool_calls && message.tool_calls.length > 0) {
               for (let i = 0; i < message.tool_calls.length; i++) {
                    const tc = message.tool_calls[i];
                    output.push({
                         id: `fc_${responseId}_${i}`,
                         type: "function_call",
                         status: "completed",
                         call_id: tc.id,
                         name: tc.function.name,
                         arguments: tc.function.arguments,
                    } as any);
               }
          } else if (message.content) {
               // Regular text message
               output.push({
                    id: `msg_${responseId}`,
                    type: "message",
                    status: "completed",
                    role: "assistant",
                    content: [
                         {
                              type: "output_text",
                              text: message.content,
                              annotations: [],
                              logprobs: [],
                         },
                    ],
               } as any);
          }
     }

     // Extract usage
     const usage = completion.usage
          ? {
                 input_tokens: completion.usage.prompt_tokens ?? 0,
                 output_tokens: completion.usage.completion_tokens ?? 0,
                 total_tokens: completion.usage.total_tokens ?? 0,
                 input_tokens_details: { cached_tokens: 0 },
                 output_tokens_details: { reasoning_tokens: 0 },
            }
          : {
                 input_tokens: 0,
                 output_tokens: 0,
                 total_tokens: 0,
                 input_tokens_details: { cached_tokens: 0 },
                 output_tokens_details: { reasoning_tokens: 0 },
            };

     return ResponsesResponseSchema.parse({
          id: responseId,
          object: "response",
          created_at: Math.floor(Date.now() / 1000),
          completed_at: null,
          status: "completed",
          incomplete_details: null,
          model: completion.model ?? request.model,
          previous_response_id: null,
          instructions: request.instructions ?? null,
          output,
          error: null,
          tools: request.tools ?? [],
          tool_choice: "auto",
          truncation: request.truncation ?? "disabled",
          parallel_tool_calls: request.parallel_tool_calls ?? true,
          text: { format: request.text?.format ?? { type: "text" } },
          top_p: request.top_p ?? 1.0,
          presence_penalty: 0,
          frequency_penalty: 0,
          top_logprobs: 0,
          temperature: request.temperature ?? 1.0,
          reasoning: request.reasoning
               ? {
                      effort: request.reasoning.effort ?? null,
                      summary: request.reasoning.summary ?? null,
                 }
               : null,
          usage,
          max_output_tokens: request.max_output_tokens ?? null,
          max_tool_calls: null,
          store: false,
          background: request.background ?? false,
          service_tier: request.service_tier ?? "default",
          metadata: {},
          safety_identifier: null,
          prompt_cache_key: null,
     });
}

// ---------------------------------------------------------------------------
// Non‑streaming: request → ResponsesResponse
// ---------------------------------------------------------------------------
export async function responseCompletion(
     req: ResponsesRequest,
): Promise<ResponsesResponse> {
     // Validate the incoming request
     const validatedReq = ResponsesRequestSchema.parse(req);

     const provider = getResponsesProvider();

     // Use Ollama provider
     if (provider === "ollama") {
          const ollamaReq = responsesToOllamaChatRequest(validatedReq);
          const responseId = `resp_${Date.now()}`;

          // Call Ollama (ensure stream is false)
          const { response: ollamaResponse, isStream } =
               await Ollama.chatForResponses({
                    ...ollamaReq,
                    stream: false,
               });

          if (isStream) {
               throw new Error(
                    "Ollama returned a stream when we asked for non-streaming",
               );
          }

          return ollamaChatToResponses(
               validatedReq,
               responseId,
               ollamaResponse,
          );
     }

     // Use Nvidia provider (default)
     // Convert to OpenAI chat format and validate
     const chatReqInput = responsesToChatRequest(validatedReq);
     const chatReq = ChatCompletionRequestSchema.parse(chatReqInput);

     // Call Nvidia (ensure stream is false)
     const response = await Nvidia.chat({ ...chatReq, stream: false } as any);
     if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new Error(`Nvidia API error ${response.status}: ${errorText}`);
     }

     const completion = await response.json();
     const responseId = completion.id ?? `resp_${Date.now()}`;

     return chatCompletionToResponses(validatedReq, responseId, completion);
}

// ---------------------------------------------------------------------------
// Streaming: request → ReadableStream of ResponsesStreamEvent SSE lines
// ---------------------------------------------------------------------------
export async function responseCompletionStream(
     req: ResponsesRequest,
): Promise<ReadableStream<Uint8Array>> {
     const validatedReq = ResponsesRequestSchema.parse(req);
     const provider = getResponsesProvider();

     const responseId = `resp_${Date.now()}`;
     const itemId = `msg_${Date.now()}`;
     let seq = 0;
     let outputIndex = 0;
     let contentStarted = false;
     let accumulatedText = "";

     const encoder = new TextEncoder();

     // Helper to create an SSE event line
     function sseEvent(event: string, data: any): string {
          return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
     }

     // Build initial events for both providers
     const responseObj = {
          id: responseId,
          object: "response",
          created_at: Math.floor(Date.now() / 1000),
          completed_at: null,
          status: "in_progress",
          incomplete_details: null,
          model: validatedReq.model,
          previous_response_id: null,
          instructions: validatedReq.instructions ?? null,
     };

     // Use Ollama provider for streaming
     if (provider === "ollama") {
          const ollamaReq = responsesToOllamaChatRequest({
               ...validatedReq,
               stream: true,
          });

          // Create a stream that transforms Ollama SSE to Responses API SSE
          const transformStream = new TransformStream<Uint8Array, Uint8Array>({
               async start(controller) {
                    // Emit initial response created event
                    let initialEvents = "";
                    initialEvents += sseEvent("response.created", {
                         ...responseObj,
                    });
                    initialEvents += sseEvent("response.in_progress", {
                         ...responseObj,
                    });
                    initialEvents += sseEvent("response.output_text.delta", {
                         type: "response.output_text.delta",
                         sequence_number: 0,
                         item_id: itemId,
                         output_index: 0,
                         content_index: 0,
                         delta: "",
                         logprobs: [],
                    });
                    controller.enqueue(encoder.encode(initialEvents));
               },
               async transform(chunk, controller) {
                    // Parse Ollama chunk and emit Responses API events
                    try {
                         const decoder = new TextDecoder();
                         const line = decoder.decode(chunk, { stream: false });
                         if (!line.trim()) return;

                         const data = JSON.parse(line);
                         const msg = data.message;

                         if (!msg) return;

                         // Handle content delta
                         const text = msg.content || "";
                         if (text) {
                              accumulatedText += text;
                              const deltaEvent = sseEvent(
                                   "response.output_text.delta",
                                   {
                                        type: "response.output_text.delta",
                                        sequence_number: seq++,
                                        item_id: itemId,
                                        output_index: 0,
                                        content_index: contentStarted
                                             ? accumulatedText.length -
                                               text.length
                                             : 0,
                                        delta: text,
                                        logprobs: [],
                                   },
                              );
                              controller.enqueue(encoder.encode(deltaEvent));
                              contentStarted = true;
                         }

                         // Handle thinking/thinking_chunk
                         const thinking =
                              msg.thinking || data.thinking_chunk || "";
                         if (thinking) {
                              const thinkingEvent = sseEvent(
                                   "response.reasoning_content.delta",
                                   {
                                        type: "response.reasoning_content.delta",
                                        sequence_number: seq++,
                                        item_id: itemId,
                                        output_index: 0,
                                        content_index: 0,
                                        delta: thinking,
                                        logprobs: [],
                                   },
                              );
                              controller.enqueue(encoder.encode(thinkingEvent));
                         }
                    } catch {
                         // ignore invalid JSON
                    }
               },
               flush(controller) {
                    // Emit final events when stream ends
                    if (contentStarted || accumulatedText) {
                         let finalEvents = "";
                         finalEvents += sseEvent("response.output_text.done", {
                              type: "response.output_text.done",
                              item_id: itemId,
                              output_index: 0,
                              content_index: accumulatedText.length,
                         });
                         finalEvents += sseEvent("response.completed", {
                              ...responseObj,
                              completed_at: Math.floor(Date.now() / 1000),
                              status: "completed",
                         });
                         controller.enqueue(encoder.encode(finalEvents));
                    }
                    controller.terminate();
               },
          });

          // Create async generator for Ollama streaming
          const ollamaStream = Ollama.chatStreamForResponses(ollamaReq);

          // Convert async generator to ReadableStream
          const readable = new ReadableStream({
               async start(controller) {
                    try {
                         for await (const chunk of ollamaStream) {
                              const encoder = new TextEncoder();
                              controller.enqueue(
                                   encoder.encode(JSON.stringify(chunk) + "\n"),
                              );
                         }
                    } catch (e) {
                         controller.error(e);
                    } finally {
                         controller.close();
                    }
               },
          });

          // Create a simple transform stream to convert Ollama chunks to Responses SSE
          const sseEncoder = new TextEncoder();

          // Return directly - no need to pipe, just wrap it properly
          // The Ollama chunks are already in the correct format
          const finalStream = new ReadableStream({
               async start(ctrl) {
                    try {
                         for await (const chunk of ollamaStream) {
                              // For Ollama streaming, we emit directly as SSE
                              const content = chunk.message?.content || "";
                              const thinking =
                                   chunk.message?.thinking ||
                                   chunk.thinking_chunk ||
                                   "";

                              if (content || thinking) {
                                   const events: string[] = [];

                                   // Emit content delta
                                   if (content) {
                                        accumulatedText += content;
                                        events.push(
                                             sseEvent(
                                                  "response.output_text.delta",
                                                  {
                                                       type: "response.output_text.delta",
                                                       sequence_number: seq++,
                                                       item_id: itemId,
                                                       output_index: 0,
                                                       content_index:
                                                            accumulatedText.length -
                                                            content.length,
                                                       delta: content,
                                                       logprobs: [],
                                                  },
                                             ),
                                        );
                                        contentStarted = true;
                                   }

                                   // Emit thinking delta
                                   if (thinking) {
                                        events.push(
                                             sseEvent(
                                                  "response.reasoning_content.delta",
                                                  {
                                                       type: "response.reasoning_content.delta",
                                                       sequence_number: seq++,
                                                       item_id: itemId,
                                                       output_index: 0,
                                                       content_index: 0,
                                                       delta: thinking,
                                                       logprobs: [],
                                                  },
                                             ),
                                        );
                                   }

                                   if (events.length > 0) {
                                        ctrl.enqueue(
                                             sseEncoder.encode(events.join("")),
                                        );
                                   }
                              }

                              // Check if done
                              if (chunk.done) {
                                   // Emit final events
                                   let finalEvents = "";
                                   if (contentStarted || accumulatedText) {
                                        finalEvents += sseEvent(
                                             "response.output_text.done",
                                             {
                                                  type: "response.output_text.done",
                                                  item_id: itemId,
                                                  output_index: 0,
                                                  content_index:
                                                       accumulatedText.length,
                                             },
                                        );
                                   }
                                   finalEvents += sseEvent(
                                        "response.completed",
                                        {
                                             ...responseObj,
                                             completed_at: Math.floor(
                                                  Date.now() / 1000,
                                             ),
                                             status: "completed",
                                        },
                                   );
                                   ctrl.enqueue(sseEncoder.encode(finalEvents));
                                   ctrl.close();
                              }
                         }
                    } catch (e) {
                         ctrl.error(e);
                    }
               },
          });

          return finalStream;
     }

     // Use Nvidia provider (default)
     const chatReqInput = responsesToChatRequest({
          ...validatedReq,
          stream: true,
     });
     const chatReq = ChatCompletionRequestSchema.parse(chatReqInput);

     const response = await Nvidia.chat({ ...chatReq, stream: true } as any);
     if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new Error(`Nvidia API error ${response.status}: ${errorText}`);
     }

     if (!response.body) {
          throw new Error("Nvidia did not return a stream body");
     }

     // We'll read the Nvidia SSE stream and transform event by event
     const reader = response.body.getReader();
     const decoder = new TextDecoder();
     let buffer = "";

     // Build initial events
     let initialEvents = "";
     initialEvents += sseEvent("response.created", {
          type: "response.created",
          sequence_number: seq++,
          response: { ...responseObj },
     });
     initialEvents += sseEvent("response.in_progress", {
          type: "response.in_progress",
          sequence_number: seq++,
          response: { ...responseObj },
     });

     // Transform the OpenAI SSE into Responses events
     const transformStream = new TransformStream<Uint8Array, Uint8Array>({
          start(controller) {
               // Send initial events
               controller.enqueue(encoder.encode(initialEvents));
          },
          async transform(chunk, controller) {
               buffer += decoder.decode(chunk, { stream: true });
               const lines = buffer.split("\n");
               buffer = lines.pop() || "";

               for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const dataStr = line.slice(6).trim();
                    if (dataStr === "[DONE]") {
                         // Emit final events and end
                         let finalEvents = "";

                         if (contentStarted) {
                              finalEvents += sseEvent(
                                   "response.output_text.done",
                                   {
                                        type: "response.output_text.done",
                                        sequence_number: seq++,
                                        item_id: itemId,
                                        output_index: 0,
                                        content_index: 0,
                                        text: accumulatedText,
                                        logprobs: [],
                                   },
                              );
                              finalEvents += sseEvent(
                                   "response.content_part.done",
                                   {
                                        type: "response.content_part.done",
                                        sequence_number: seq++,
                                        item_id: itemId,
                                        output_index: 0,
                                        content_index: 0,
                                        part: {
                                             type: "output_text",
                                             text: accumulatedText,
                                             annotations: [],
                                             logprobs: [],
                                        },
                                   },
                              );
                              finalEvents += sseEvent(
                                   "response.output_item.done",
                                   {
                                        type: "response.output_item.done",
                                        sequence_number: seq++,
                                        output_index: 0,
                                        item: {
                                             id: itemId,
                                             type: "message",
                                             status: "completed",
                                             role: "assistant",
                                             content: [
                                                  {
                                                       type: "output_text",
                                                       text: accumulatedText,
                                                       annotations: [],
                                                       logprobs: [],
                                                  },
                                             ],
                                        },
                                   },
                              );
                         }

                         const completedResponse = {
                              ...responseObj,
                              status: "completed",
                              output: contentStarted
                                   ? [
                                          {
                                               id: itemId,
                                               type: "message",
                                               status: "completed",
                                               role: "assistant",
                                               content: [
                                                    {
                                                         type: "output_text",
                                                         text: accumulatedText,
                                                         annotations: [],
                                                         logprobs: [],
                                                    },
                                               ],
                                          },
                                     ]
                                   : [],
                              usage: {
                                   input_tokens: 0,
                                   output_tokens: 0,
                                   total_tokens: 0,
                                   input_tokens_details: { cached_tokens: 0 },
                                   output_tokens_details: {
                                        reasoning_tokens: 0,
                                   },
                              },
                         };
                         finalEvents += sseEvent("response.completed", {
                              type: "response.completed",
                              sequence_number: seq++,
                              response: completedResponse,
                         });
                         controller.enqueue(encoder.encode(finalEvents));
                         controller.terminate();
                         return;
                    }

                    try {
                         const chunk = JSON.parse(dataStr);
                         const delta = chunk.choices?.[0]?.delta;
                         if (!delta || delta.content === undefined) continue;

                         const text = delta.content ?? "";

                         if (!contentStarted && text) {
                              // First content, emit added events
                              const itemAdded = sseEvent(
                                   "response.output_item.added",
                                   {
                                        type: "response.output_item.added",
                                        sequence_number: seq++,
                                        output_index: 0,
                                        item: {
                                             id: itemId,
                                             type: "message",
                                             status: "in_progress",
                                             role: "assistant",
                                             content: [],
                                        },
                                   },
                              );
                              const partAdded = sseEvent(
                                   "response.content_part.added",
                                   {
                                        type: "response.content_part.added",
                                        sequence_number: seq++,
                                        item_id: itemId,
                                        output_index: 0,
                                        content_index: 0,
                                        part: {
                                             type: "output_text",
                                             text: "",
                                             annotations: [],
                                             logprobs: [],
                                        },
                                   },
                              );
                              controller.enqueue(
                                   encoder.encode(itemAdded + partAdded),
                              );
                              contentStarted = true;
                         }

                         if (text) {
                              accumulatedText += text;
                              const deltaEvent = sseEvent(
                                   "response.output_text.delta",
                                   {
                                        type: "response.output_text.delta",
                                        sequence_number: seq++,
                                        item_id: itemId,
                                        output_index: 0,
                                        content_index: 0,
                                        delta: text,
                                        logprobs: [],
                                   },
                              );
                              controller.enqueue(encoder.encode(deltaEvent));
                         }
                    } catch {
                         // ignore invalid JSON
                    }
               }
          },
          flush(controller) {
               // If stream ends without [DONE] (unlikely), still emit final events
               if (contentStarted) {
                    // emit done/final events similar to above
                    let finalEvents = "";
                    finalEvents += sseEvent("response.output_text.done", {
                         /*...*/
                    });
                    // (same as above)
                    controller.enqueue(encoder.encode(finalEvents));
               }
               controller.terminate();
          },
     });

     // Pipe the response body through our transformer
     response.body.pipeTo(transformStream.writable);
     return transformStream.readable;
}
