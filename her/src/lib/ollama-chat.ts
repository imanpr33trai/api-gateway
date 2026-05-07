/**
 * Ollama Chat API Client
 * 
 * This module provides a chat function that calls Ollama's native /api/chat endpoint.
 * It transforms requests to Ollama format and handles responses.
 */

import type { Request, Response } from "node-fetch";

/**
 * Chat request options for Ollama
 */
export interface ChatOptions {
  /** Ollama base URL */
  baseURL?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Custom headers */
  headers?: Record<string, string>;
}

/**
 * Default configuration
 */
const DEFAULT_OPTIONS: Required<ChatOptions> = {
  baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  timeout: 120000, // 2 minutes
  headers: {
    "Content-Type": "application/json",
  },
};

/**
 * Create a chat function configured for Ollama
 * 
 * @param options - Configuration options
 * @returns A chat function that returns Promise<Response>
 * 
 * @example
 * ```typescript
 * import { createChatFunction } from './chat';
 * 
 * const chat = createChatFunction({
 *   baseURL: 'http://localhost:11434',
 *   timeout: 60000,
 * });
 * 
 * // Use in controller
 * const response = await chat({
 *   model: 'llama3.2:3b',
 *   messages: [{ role: 'user', content: 'Hello' }],
 *   stream: false,
 * });
 * ```
 */
export function createChatFunction(options: ChatOptions = {}): ChatFunction {
  const config: Required<ChatOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  return async (request: OllamaChatRequest): Promise<OllamaChatResponse> => {
    const url = `${config.baseURL}/api/chat`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...config.headers,
          ...(request.stream ? { Accept: "text/event-stream" } : {}),
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(config.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      // Handle streaming response
      if (request.stream) {
        // For streaming, we return a modified response object
        // that can be consumed by the streaming handler
        return {
          model: request.model,
          message: {
            role: "assistant",
            content: "",
          },
          done: false,
          // Add stream property to indicate streaming
          ...{ stream: response.body },
        } as unknown as OllamaChatResponse;
      }

      // Handle non-streaming response
      const data = await response.json() as OllamaChatResponse;
      return data;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error(`Request timeout after ${config.timeout}ms`);
        }
        throw error;
      }
      throw new Error("Unknown error calling Ollama");
    }
  };
}

/**
 * Simple default chat function using environment variables
 * Can be used directly without configuration
 */
export const defaultChatFunction = createChatFunction();

// ============================================================================
// Type Definitions (matching the service)
// ============================================================================

/**
 * Ollama native chat request format
 */
export interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  options?: OllamaOptions;
  tools?: OllamaTool[];
  format?: unknown;
  think?: OllamaThink;
}

/**
 * Ollama message format
 */
export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: OllamaImageData[];
  tool_calls?: OllamaToolCall[];
  tool_call_id?: string;
  thinking?: string;
  name?: string;
}

/**
 * Ollama image data (base64 encoded)
 */
export type OllamaImageData = string | number[];

/**
 * Ollama options (mapped from OpenAI parameters)
 */
export interface OllamaOptions {
  temperature?: number;
  top_p?: number;
  num_predict?: number;
  stop?: string[];
  seed?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

/**
 * Ollama think value for reasoning models
 */
export interface OllamaThink {
  value: string | boolean;
}

/**
 * Ollama tool definition
 */
export interface OllamaTool {
  type: string;
  function: OllamaToolFunction;
}

export interface OllamaToolFunction {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

/**
 * Ollama tool call
 */
export interface OllamaToolCall {
  id: string;
  type: string;
  function: OllamaToolCallFunction;
}

export interface OllamaToolCallFunction {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Ollama chat response
 */
export interface OllamaChatResponse {
  model: string;
  message: OllamaMessage;
  done: boolean;
  done_reason?: string;
  metrics?: OllamaMetrics;
  stream?: unknown; // For streaming responses
}

export interface OllamaMetrics {
  prompt_eval_count: number;
  eval_count: number;
  prompt_eval_duration: number;
  eval_duration: number;
}

/**
 * The chat function type - takes an Ollama request and returns a Promise
 * that resolves to the Ollama response
 */
export type ChatFunction = (
  request: OllamaChatRequest
) => Promise<OllamaChatResponse>;

// ============================================================================
// Additional Helper Functions
// ============================================================================

/**
 * Create a chat function that also handles streaming
 * This version returns a response that can be used with streaming utilities
 * 
 * @param options - Configuration options
 * @returns A chat function
 */
export function createStreamingChatFunction(options: ChatOptions = {}): ChatFunction {
  const baseChatFunction = createChatFunction(options);

  return async (request: OllamaChatRequest): Promise<OllamaChatResponse> => {
    // For streaming, we handle it differently
    if (request.stream) {
      const url = `${options.baseURL || DEFAULT_OPTIONS.baseURL}/api/chat`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ ...request, stream: true }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      // Return the streaming response body
      return {
        model: request.model,
        message: {
          role: "assistant",
          content: "",
        },
        done: false,
        stream: response.body,
      } as unknown as OllamaChatResponse;
    }

    // Non-streaming uses the base function
    return baseChatFunction(request);
  };
}

/**
 * Test if Ollama is available and responding
 * 
 * @param baseURL - Optional base URL (defaults to environment or localhost:11434)
 * @returns Promise that resolves to boolean
 */
export async function isOllamaAvailable(baseURL?: string): Promise<boolean> {
  try {
    const url = baseURL || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    const response = await fetch(`${url}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get list of available models from Ollama
 * 
 * @param baseURL - Optional base URL
 * @returns Array of model names
 */
export async function listModels(baseURL?: string): Promise<string[]> {
  const url = baseURL || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  
  const response = await fetch(`${url}/api/tags`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`Failed to list models: ${response.statusText}`);
  }

  const data = await response.json() as { models: Array<{ name: string }> };
  return data.models.map((m) => m.name);
}
