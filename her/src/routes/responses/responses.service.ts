import type { Response } from "node-fetch";
import type {
  ResponsesRequest,
  ResponsesResponse,
  ResponsesInputItem,
  ResponsesInputMessage,
  ResponsesFunctionCall,
  ResponsesFunctionCallOutput,
  ResponsesReasoningInput,
  ResponsesContent,
  ResponsesTextContent,
  ResponsesImageContent,
  ResponsesTool,
} from "./responses.schemas.js";

/**
 * Chat function type - returns a Promise that resolves to the Ollama response
 * This function should be imported from another module (e.g., ollama client)
 */
export type ChatFunction = (
  request: OllamaChatRequest
) => Promise<OllamaChatResponse>;

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
}

export interface OllamaMetrics {
  prompt_eval_count: number;
  eval_count: number;
  prompt_eval_duration: number;
  eval_duration: number;
}

/**
 * Service configuration
 */
export interface ResponsesServiceConfig {
  chatFunction: ChatFunction;
  defaultModel: string;
  maxTokensDefault: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ResponsesServiceConfig = {
  chatFunction: async () => {
    throw new Error("Chat function not configured");
  },
  defaultModel: "llama3.2:3b",
  maxTokensDefault: 4096,
};

/**
 * Responses Service - handles business logic for /v1/responses endpoint
 */
export class ResponsesService {
  private config: ResponsesServiceConfig;

  constructor(config: Partial<ResponsesServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process a Responses API request and return the response
   */
  async processRequest(request: ResponsesRequest): Promise<ResponsesResponse> {
    // Convert Responses API request to Ollama native format
    const ollamaRequest = this.convertToOllamaRequest(request);

    // Call the Ollama chat function
    const ollamaResponse = await this.config.chatFunction(ollamaRequest);

    // Convert Ollama response back to Responses API format
    return this.convertToResponsesResponse(request, ollamaResponse);
  }

  /**
   * Process a streaming request
   * Returns an async generator of stream events
   */
  async *processStreamRequest(
    request: ResponsesRequest
  ): AsyncGenerator<StreamEvent> {
    const ollamaRequest: OllamaChatRequest = {
      ...this.convertToOllamaRequest(request),
      stream: true,
    };

    const response = await this.config.chatFunction(ollamaRequest);

    // For streaming, we need to handle SSE
    // This is a simplified version - actual implementation would parse SSE
    yield* this.handleStreamingResponse(request, response);
  }

  /**
   * Convert Responses API request to Ollama native format
   */
  private convertToOllamaRequest(request: ResponsesRequest): OllamaChatRequest {
    const messages: OllamaMessage[] = [];

    // Add instructions as system message
    if (request.instructions) {
      messages.push({
        role: "system",
        content: request.instructions,
      });
    }

    // Handle input (string or items)
    if (request.input.text) {
      messages.push({
        role: "user",
        content: request.input.text,
      });
    }

    // Handle array of input items
    for (const item of request.input.items) {
      const converted = this.convertInputItem(item);
      if (converted) {
        messages.push(converted);
      }
    }

    // Build options
    const options: OllamaOptions = {};
    if (request.temperature !== undefined) {
      options.temperature = request.temperature;
    }
    if (request.top_p !== undefined) {
      options.top_p = request.top_p;
    }
    if (request.max_output_tokens !== undefined) {
      options.num_predict = request.max_output_tokens;
    }

    // Handle reasoning/thinking
    let think: OllamaThink | undefined;
    if (request.reasoning?.effort) {
      const effort = request.reasoning.effort;
      if (effort === "none") {
        think = { value: false };
      } else if (effort && ["high", "medium", "low", "max"].includes(effort)) {
        think = { value: effort };
      }
    }

    // Convert tools
    const tools = request.tools?.map(this.convertTool);

    // Handle text format (JSON mode)
    let format: unknown;
    if (request.text?.format?.type === "json_schema") {
      format = request.text.format.schema;
    } else if (request.text?.format?.type === "text") {
      format = "text"; // Plain text
    }

    return {
      model: request.model,
      messages,
      stream: request.stream,
      options: Object.keys(options).length > 0 ? options : undefined,
      tools,
      format,
      think,
    };
  }

  /**
   * Convert input item to Ollama message format
   */
  private convertInputItem(item: ResponsesInputItem): OllamaMessage | null {
    switch (item.type) {
      case "message":
        return this.convertMessageToOllama(item);

      case "function_call":
        return {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: item.call_id,
              type: "function",
              function: {
                name: item.name,
                arguments: this.parseArguments(item.arguments),
              },
            },
          ],
        };

      case "function_call_output":
        return {
          role: "tool",
          content: typeof item.output === "string" ? item.output : JSON.stringify(item.output),
          tool_call_id: item.call_id,
        };

      case "reasoning":
        // Store thinking for next assistant message
        return {
          role: "assistant",
          content: "",
          thinking: item.encrypted_content,
        };

      default:
        return null;
    }
  }

  /**
   * Convert input message to Ollama format
   */
  private convertMessageToOllama(msg: ResponsesInputMessage): OllamaMessage {
    const role = msg.role as "system" | "user" | "assistant";
    let content = "";
    let images: OllamaImageData[] = [];

    // Handle content (string or array)
    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      for (const c of msg.content) {
        const converted = this.convertContent(c);
        if (converted.text) {
          content += converted.text;
        }
        if (converted.images) {
          images.push(...converted.images);
        }
      }
    }

    return {
      role,
      content,
      ...(images.length > 0 && { images }),
    };
  }

  /**
   * Convert content to text and images
   */
  private convertContent(
    content: ResponsesContent
  ): { text?: string; images?: OllamaImageData[] } {
    switch (content.type) {
      case "input_text":
      case "output_text":
        return { text: content.text };

      case "input_image":
        // Handle image_url - decode base64 if needed
        if (content.image_url) {
          const imageData = this.decodeImageURL(content.image_url);
          return { images: [imageData] };
        }
        return {};

      case "input_file":
        // File content not fully supported
        return {};

      default:
        return {};
    }
  }

  /**
   * Decode image URL (base64 data URI)
   */
  private decodeImageURL(url: string): string {
    // Remove data URI prefix if present
    // e.g., "data:image/png;base64,iVBORw0KGgo..."
    const base64Match = url.match(/^data:image\/\w+;base64,(.+)$/);
    if (base64Match) {
      return base64Match[1];
    }
    return url;
  }

  /**
   * Parse JSON arguments string to object
   */
  private parseArguments(args: string): Record<string, unknown> {
    try {
      return JSON.parse(args);
    } catch {
      return {};
    }
  }

  /**
   * Convert tool definition from Responses API to Ollama format
   */
  private convertTool(tool: ResponsesTool): OllamaTool {
    return {
      type: tool.type,
      function: {
        name: tool.name,
        description: tool.description || "",
        parameters: (tool.parameters as Record<string, unknown>) || {},
      },
    };
  }

  /**
   * Convert Ollama response to Responses API format
   */
  private convertToResponsesResponse(
    request: ResponsesRequest,
    ollamaResponse: OllamaChatResponse
  ): ResponsesResponse {
    const responseId = this.generateResponseId();
    const model = request.model;
    const createdAt = Math.floor(Date.now() / 1000);

    const output: ResponsesOutputItem[] = [];

    // Add reasoning/thinking if present
    if (ollamaResponse.message.thinking) {
      output.push({
        type: "reasoning",
        id: `rs_${responseId}`,
        summary: [
          {
            type: "summary_text",
            text: ollamaResponse.message.thinking,
          },
        ],
        encrypted_content: ollamaResponse.message.thinking,
      });
    }

    // Add tool calls if present
    if (ollamaResponse.message.tool_calls && ollamaResponse.message.tool_calls.length > 0) {
      for (let i = 0; i < ollamaResponse.message.tool_calls.length; i++) {
        const tc = ollamaResponse.message.tool_calls[i];
        output.push({
          type: "function_call",
          id: `fc_${responseId}_${i}`,
          call_id: tc.id,
          name: tc.function.name,
          arguments: JSON.stringify(tc.function.arguments),
          status: "completed",
        });
      }
    } else if (ollamaResponse.message.content) {
      // Add text content
      output.push({
        type: "message",
        id: `msg_${responseId}`,
        status: "completed",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: ollamaResponse.message.content,
            annotations: [],
            logprobs: [],
          },
        ],
      });
    }

    // Build usage
    const usage: ResponsesUsage = {
      input_tokens: ollamaResponse.metrics?.prompt_eval_count || 0,
      output_tokens: ollamaResponse.metrics?.eval_count || 0,
      total_tokens:
        (ollamaResponse.metrics?.prompt_eval_count || 0) +
        (ollamaResponse.metrics?.eval_count || 0),
      input_tokens_details: {
        cached_tokens: 0,
      },
      output_tokens_details: {
        reasoning_tokens: 0,
      },
    };

    return {
      id: responseId,
      object: "response",
      created_at: createdAt,
      completed_at: createdAt,
      status: ollamaResponse.done ? "completed" : "in_progress",
      model,
      previous_response_id: undefined,
      instructions: request.instructions,
      output,
      error: undefined,
      tools: request.tools || [],
      tool_choice: "auto",
      truncation: request.truncation || "disabled",
      parallel_tool_calls: true,
      text: request.text || { format: { type: "text" } },
      top_p: request.top_p || 1.0,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_logprobs: 0,
      temperature: request.temperature || 1.0,
      reasoning: request.reasoning,
      usage,
      max_output_tokens: request.max_output_tokens,
      max_tool_calls: undefined,
      store: false,
      background: request.background,
      service_tier: "default",
      metadata: {},
      safety_identifier: undefined,
      prompt_cache_key: undefined,
    };
  }

  /**
   * Handle streaming response
   */
  private async *handleStreamingResponse(
    request: ResponsesRequest,
    _response: OllamaChatResponse
  ): AsyncGenerator<StreamEvent> {
    const responseId = this.generateResponseId();
    const itemId = `msg_${responseId}`;

    // Yield response.created event
    yield {
      type: "response.created",
      data: {
        id: responseId,
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        model: request.model,
        instructions: request.instructions,
        text: request.text || { format: { type: "text" } },
      },
    };

    // Yield response.in_progress event
    yield {
      type: "response.in_progress",
      data: {
        id: responseId,
      },
    };

    // Note: Actual streaming implementation would fetch from Ollama
    // and convert each chunk to SSE events
    // This is a placeholder for the streaming logic
  }

  /**
   * Generate a unique response ID
   */
  private generateResponseId(): string {
    return `resp_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

/**
 * Stream event for SSE
 */
export interface StreamEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Responses usage type (re-exported for convenience)
 */
export type ResponsesUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: {
    cached_tokens: number;
  };
  output_tokens_details?: {
    reasoning_tokens: number;
  };
};

/**
 * Responses output item type
 */
export type ResponsesOutputItem =
  | {
      type: "message";
      id: string;
      status?: string;
      role: "user" | "assistant" | "system";
      content: Array<{
        type: "output_text";
        text: string;
        annotations?: unknown[];
        logprobs?: unknown[];
      }>;
    }
  | {
      type: "function_call";
      id: string;
      call_id: string;
      name: string;
      arguments: string;
      status?: string;
    }
  | {
      type: "reasoning";
      id: string;
      summary: Array<{
        type: "summary_text";
        text: string;
      }>;
      encrypted_content?: string;
    };

/**
 * Create a ResponsesService with the provided chat function
 */
export function createResponsesService(chatFunction: ChatFunction): ResponsesService {
  return new ResponsesService({
    chatFunction,
  });
}
