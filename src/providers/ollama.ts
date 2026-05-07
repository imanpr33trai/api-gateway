import type { ChatCompletionRequest } from "../types";
import type { ChatRequest, ChatResponse } from "../types/ollama";

const BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

/**
 * Ollama provider for chat completions and responses API
 */
export const Ollama = {
    /**
     * Chat completion - calls /api/chat endpoint
     * Works with Chat Completions format
     */
    async chat(req: ChatCompletionRequest): Promise<Response> {
        const ollamaRequest = this.convertChatCompletionToOllama(req);
        
        const response = await fetch(`${BASE_URL}/api/chat`, {
            method: "POST",
            body: JSON.stringify(ollamaRequest),
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            throw new Error(`Ollama API Error: ${response.status} - ${errorText}`);
        }

        return response;
    },

    /**
     * Chat completion for Responses API - returns parsed response
     * Converts Responses API format to Ollama and back
     */
    async chatForResponses(req: {
        model: string;
        messages: any[];
        stream?: boolean;
        tools?: any[];
        temperature?: number;
        top_p?: number;
        max_tokens?: number;
        reasoning_effort?: string;
        format?: any;
        think?: boolean | string;
    }): Promise<{ response: ChatResponse; isStream: boolean }> {
        const ollamaRequest: any = {
            model: req.model,
            messages: this.convertMessagesToOllama(req.messages),
            stream: req.stream ?? false,
            tools: req.tools,
            options: {
                temperature: req.temperature,
                top_p: req.top_p,
                num_predict: req.max_tokens,
            },
        };

        // Handle think parameter for reasoning models
        if (req.think !== undefined) {
            ollamaRequest.think = req.think;
        }

        // Handle JSON format
        if (req.format) {
            if (req.format.type === "json_schema") {
                ollamaRequest.format = { type: "json_schema", schema: req.format.json_schema?.schema };
            } else if (req.format.type === "json_object") {
                ollamaRequest.format = { type: "json_object" };
            }
        }

        const response = await fetch(`${BASE_URL}/api/chat`, {
            method: "POST",
            body: JSON.stringify(ollamaRequest),
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            throw new Error(`Ollama API Error: ${response.status} - ${errorText}`);
        }

        if (req.stream) {
            return { response: null as any, isStream: true };
        }

        const data = await response.json();
        return { response: data as ChatResponse, isStream: false };
    },

    /**
     * Stream chat for Responses API
     */
    async *chatStreamForResponses(req: {
        model: string;
        messages: any[];
        tools?: any[];
        temperature?: number;
        top_p?: number;
        max_tokens?: number;
        reasoning_effort?: string;
        format?: any;
    }): AsyncGenerator<any> {
        const ollamaRequest: ChatRequest = {
            model: req.model,
            messages: this.convertMessagesToOllama(req.messages),
            stream: true,
            tools: req.tools as any,
            options: {
                temperature: req.temperature,
                top_p: req.top_p,
                num_predict: req.max_tokens,
            },
        };

        const response = await fetch(`${BASE_URL}/api/chat`, {
            method: "POST",
            body: JSON.stringify(ollamaRequest),
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            throw new Error(`Ollama API Error: ${response.status} - ${errorText}`);
        }

        if (!response.body) {
            throw new Error("Ollama did not return a stream body");
        }

        const decoder = new TextDecoder();
        const reader = response.body.getReader();
        let buffer = "";

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (!line.trim() || line.startsWith("#")) continue;
                    if (line.startsWith("data: ")) {
                        const dataStr = line.slice(6).trim();
                        if (dataStr === "[DONE]") {
                            return;
                        }
                        try {
                            const chunk = JSON.parse(dataStr);
                            yield chunk;
                        } catch {
                            // Skip invalid JSON
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    },

    getAllModels(): Promise<Response> {
        return fetch(`${BASE_URL}/api/tags`);
    },

    /**
     * Convert ChatCompletion request to Ollama chat format
     */
    convertChatCompletionToOllama(req: ChatCompletionRequest): ChatRequest {
        return {
            model: req.model,
            messages: this.convertMessagesToOllama(req.messages as any),
            stream: req.stream ?? false,
            tools: req.tools as any,
            options: {
                temperature: req.temperature,
                top_p: req.top_p,
                num_predict: req.max_tokens,
            },
        };
    },

    /**
     * Convert messages from OpenAI format to Ollama format
     */
    convertMessagesToOllama(messages: any[]): any[] {
        return messages.map((msg) => {
            const ollamaMsg: any = {
                role: msg.role,
                content: typeof msg.content === "string" ? msg.content : "",
            };

            // Handle content array
            if (Array.isArray(msg.content)) {
                const textParts = msg.content.filter((c: any) => c.type === "text");
                ollamaMsg.content = textParts.map((c: any) => c.text).join("");

                // Handle images
                const imageParts = msg.content.filter((c: any) => c.type === "input_image");
                if (imageParts.length > 0) {
                    ollamaMsg.images = imageParts.map((c: any) => c.image_url?.url?.split(",")[1] || c.image_url);
                }
            }

            // Handle tool calls
            if (msg.tool_calls) {
                ollamaMsg.tool_calls = msg.tool_calls.map((tc: any) => ({
                    function: {
                        name: tc.function.name,
                        arguments: typeof tc.function.arguments === "string"
                            ? JSON.parse(tc.function.arguments)
                            : tc.function.arguments,
                    },
                }));
            }

            // Handle tool message
            if (msg.tool_call_id) {
                ollamaMsg.tool_call_id = msg.tool_call_id;
            }

            // Handle thinking (for reasoning models)
            if (msg.thinking) {
                ollamaMsg.thinking = msg.thinking;
            }

            return ollamaMsg;
        });
    },

    /**
     * Format messages for Ollama (simple text format)
     */
    formatMessages(messages: any[]): string {
        return messages
            .map((msg) => `${msg.role}: ${typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}`)
            .join("\n");
    },
};
