// src/services/chat.service.ts
import { Nvidia } from "../providers/nvidia";
import {
     ChatCompletionRequestSchema,
     type ChatCompletionRequest,
} from "../providers/types";
import { ChatResponseSchema, type ChatResponse } from "../types/types";

/**
 * Non‑streaming chat completion.
 * Validates, calls Nvidia, parses & validates the JSON response.
 */
export async function chatCompletion(
     req: ChatCompletionRequest,
): Promise<ChatResponse> {
     const validated = ChatCompletionRequestSchema.parse(req);
     const response = await Nvidia.chat(validated);

     if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          throw new Error(`Provider error ${response.status}: ${errorBody}`);
     }

     const json = await response.json();
     return ChatResponseSchema.parse(json);
}

/**
 * Streaming chat completion.
 * Returns the raw provider Response (body is a ReadableStream).
 */
export async function chatCompletionStream(
     req: ChatCompletionRequest & { stream: true },
): Promise<Response> {
     const validated = ChatCompletionRequestSchema.parse(req);
     const response = await Nvidia.chat(validated);

     if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          throw new Error(`Provider error ${response.status}: ${errorBody}`);
     }

     return response; // raw stream
}

/**
 * Simplified generate – takes a prompt string and returns just the text content.
 * Non‑streaming only.
 */
export async function generateCompletion(
     prompt: string,
     model = "meta/llama3-8b-instruct",
): Promise<string> {
     const request: ChatCompletionRequest = {
          model,
          messages: [{ role: "user", content: prompt }],
     };

     const result = await chatCompletion(request);
     return result.choices[0]?.message?.content ?? "";
}
