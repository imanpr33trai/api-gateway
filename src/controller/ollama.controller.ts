// src/controller/ollama.controller.ts
import type { Context } from "hono";
import { z } from "zod";
import { ChatCompletionRequestSchema } from "../providers/types";
import { fromChatRequest, toChatCompletion, toChatCompletionChunk } from "../services/ollama.service";
import { ValidationError } from "../types/error.type";
import { handleAsync } from "../utils/errorHandler";

// Simple fetch implementation for Ollama
const fetchOllama = async (url: string, options: any) => {
    try {
        const response = await fetch(url, options);
        return response;
    } catch (error) {
        throw new Error(`Failed to connect to Ollama: ${error}`);
    }
};

export const ollamaChatController = async (c: Context) => {
    try {
        const body = await c.req.json();
        const parsed = ChatCompletionRequestSchema.parse(body);

        // Convert to Ollama format
        const ollamaRequest = fromChatRequest(parsed);

        // Make request to Ollama
        const response = await fetchOllama("http://localhost:11434/api/chat", {
            method: "POST",
            body: JSON.stringify(ollamaRequest),
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => "Unknown error");
            throw new Error(`Ollama API error ${response.status}: ${errorText}`);
        }

        if (parsed.stream) {
            // Handle streaming response
            if (!response.body) {
                return c.text("Ollama did not return a stream body", 500);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            const stream = new ReadableStream({
                async pull(controller) {
                    try {
                        const { done, value } = await reader.read();
                        if (done) {
                            controller.close();
                            return;
                        }

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split("\n");
                        buffer = lines.pop() || "";

                        for (const line of lines) {
                            if (!line.trim()) continue;
                            if (line.startsWith("data: ")) {
                                const dataStr = line.slice(6).trim();
                                if (dataStr === "[DONE]") {
                                    controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
                                    controller.close();
                                    return;
                                }

                                try {
                                    const chunk = JSON.parse(dataStr);
                                    const id = `chatcmpl-${Date.now()}`;
                                    const transformed = toChatCompletionChunk(id, chunk);
                                    const data = JSON.stringify(transformed);
                                    controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
                                } catch {
                                    // Skip invalid JSON
                                }
                            }
                        }
                    } catch (error) {
                        controller.error(error);
                    }
                },
                cancel() {
                    reader.cancel().catch(() => {});
                },
            });

            return new Response(stream, {
                status: 200,
                headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                },
            });
        } else {
            // Handle non-streaming response
            const ollamaResponse = await response.json();
            const responseId = `chatcmpl-${Date.now()}`;
            const result = toChatCompletion(responseId, ollamaResponse);
            return c.json(result);
        }
    } catch (err) {
        if (err instanceof z.ZodError) {
            throw new ValidationError("Invalid request body", {
                issues: err.issues,
            });
        }
        throw err;
    }
};