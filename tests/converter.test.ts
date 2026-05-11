// tests/converter.test.ts
// Tests for the Responses API <-> OpenAI converter

import { beforeEach, describe, expect, it } from "bun:test";
import { ResponsesToOpenAIConverter } from "../src/converters/responses-to-openai.js";

describe("ResponsesToOpenAIConverter", () => {
     let converter: ResponsesToOpenAIConverter;

     beforeEach(() => {
          converter = new ResponsesToOpenAIConverter({
               defaultModel: "nvidia/llama-3.1-nemotron-70b-instruct",
               modelMap: { "gpt-4": "openai/gpt-4" },
          });
     });

     describe("convertRequest", () => {
          it("should convert simple Responses request to OpenAI format", () => {
               const responsesReq = {
                    model: "nvidia/llama-3.1-nemotron-70b-instruct",
                    input: "Hello, how are you?",
                    stream: false,
               };

               const result = converter.convertRequest(responsesReq);

               expect(result.model).toBe(
                    "nvidia/llama-3.1-nemotron-70b-instruct",
               );
               expect(result.messages).toBeArray();
               expect(result.messages[0].role).toBe("user");
               expect(result.messages[0].content).toBe("Hello, how are you?");
               expect(result.stream).toBe(false);
          });

          it("should convert Responses request with instructions", () => {
               const responsesReq = {
                    model: "nvidia/llama-3.1-nemotron-70b-instruct",
                    instructions: "You are a helpful assistant",
                    input: "Hello",
                    stream: false,
               };

               const result = converter.convertRequest(responsesReq);

               expect(result.messages[0].role).toBe("system");
               expect(result.messages[0].content).toBe(
                    "You are a helpful assistant",
               );
               expect(result.messages[1].role).toBe("user");
          });

          it("should map model names using modelMap", () => {
               const responsesReq = {
                    model: "gpt-4",
                    input: "Hello",
               };

               const result = converter.convertRequest(responsesReq);

               expect(result.model).toBe("openai/gpt-4");
          });

          it("should convert input array with function calls", () => {
               const responsesReq = {
                    model: "nvidia/llama-3.1-nemotron-70b-instruct",
                    input: [
                         {
                              type: "message",
                              role: "user",
                              content: "What is the weather?",
                         },
                         {
                              type: "function_call",
                              call_id: "call_123",
                              name: "get_weather",
                              arguments: '{"location": "NYC"}',
                         },
                         {
                              type: "function_call_output",
                              call_id: "call_123",
                              output: '{"temp": 72}',
                         },
                    ],
               };

               const result = converter.convertRequest(responsesReq);

               expect(result.messages).toHaveLength(3);
               expect(result.messages[1].role).toBe("assistant");
               expect(result.messages[1].tool_calls).toBeArray();
               expect(result.messages[2].role).toBe("tool");
          });
     });

     describe("convertResponse", () => {
          it("should convert OpenAI response to Responses format", () => {
               const openaiResp = {
                    id: "chatcmpl-123",
                    object: "chat.completion",
                    created: 1234567890,
                    model: "nvidia/llama-3.1-nemotron-70b-instruct",
                    choices: [
                         {
                              index: 0,
                              message: {
                                   role: "assistant",
                                   content: "Hello! I am doing well, thank you!",
                              },
                              finish_reason: "stop",
                         },
                    ],
                    usage: {
                         prompt_tokens: 10,
                         completion_tokens: 20,
                         total_tokens: 30,
                    },
               };

               const originalReq = {
                    model: "nvidia/llama-3.1-nemotron-70b-instruct",
               };
               const result = converter.convertResponse(
                    openaiResp,
                    originalReq,
               );

               expect(result.object).toBe("response");
               expect(result.status).toBe("completed");
               expect(result.output).toBeArray();
               expect(result.output[0].type).toBe("message");
               expect(result.output[0].content[0].text).toBe(
                    "Hello! I am doing well, thank you!",
               );
          });

          it("should handle tool calls in response", () => {
               const openaiResp = {
                    id: "chatcmpl-123",
                    object: "chat.completion",
                    created: 1234567890,
                    model: "nvidia/llama-3.1-nemotron-70b-instruct",
                    choices: [
                         {
                              index: 0,
                              message: {
                                   role: "assistant",
                                   content: null,
                                   tool_calls: [
                                        {
                                             id: "call_123",
                                             type: "function",
                                             function: {
                                                  name: "get_weather",
                                                  arguments:
                                                       '{"location": "NYC"}',
                                             },
                                        },
                                   ],
                              },
                              finish_reason: "tool_calls",
                         },
                    ],
                    usage: {
                         prompt_tokens: 10,
                         completion_tokens: 20,
                         total_tokens: 30,
                    },
               };

               const originalReq = {
                    model: "nvidia/llama-3.1-nemotron-70b-instruct",
               };
               const result = converter.convertResponse(
                    openaiResp,
                    originalReq,
               );

               expect(result.output).toBeArray();
               expect(result.output[0].type).toBe("function_call");
               expect(result.output[0].name).toBe("get_weather");
          });
     });
});
