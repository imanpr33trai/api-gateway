import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatMessage,
  ToolCall,
} from "./chat-completions.schemas.js";
import type { ChatFunction, OllamaChatRequest, OllamaChatResponse, OllamaMessage } from "../responses/responses.service.js";

/**
 * Chat Completions Service
 * Handles conversion between OpenAI Chat Completions and Ollama format
 */
export class ChatCompletionsService {
  private chatFunction: ChatFunction;

  constructor(chatFunction: ChatFunction) {
    this.chatFunction = chatFunction;
  }

  /**
   * Process a chat completion request
   */
  async processRequest(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const ollamaRequest = this.convertToOllamaRequest(request);
    const ollamaResponse = await this.chatFunction(ollamaRequest);

    return this.convertToResponse(request, ollamaResponse);
  }

  /**
   * Process streaming request
   */
  async *processStreamRequest(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionChunk> {
    const ollamaRequest: OllamaChatRequest = {
      ...this.convertToOllamaRequest(request),
      stream: true,
    };

    const response = await this.chatFunction(ollamaRequest);

    // For streaming, yield chunks as they come
    // This is a simplified implementation
    const responseId = this.generateId();

    // Yield content chunks
    let index = 0;

    // First chunk with role
    yield {
      id: responseId,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            content: "",
          },
          finish_reason: null,
        },
      ],
    };

    // Note: Real streaming would parse the SSE stream from Ollama
    // This is a placeholder for the actual streaming logic
  }

  /**
   * Convert ChatCompletion request to Ollama format
   */
  private convertToOllamaRequest(request: ChatCompletionRequest): OllamaChatRequest {
    const messages: OllamaMessage[] = request.messages.map((msg) => this.convertMessage(msg));

    // Build options
    const options: Record<string, unknown> = {};

    if (request.temperature !== undefined) {
      options.temperature = request.temperature;
    }
    if (request.top_p !== undefined) {
      options.top_p = request.top_p;
    }
    if (request.max_tokens !== undefined) {
      options.num_predict = request.max_tokens;
    }
    if (request.seed !== undefined) {
      options.seed = request.seed;
    }
    if (request.frequency_penalty !== undefined) {
      options.frequency_penalty = request.frequency_penalty;
    }
    if (request.presence_penalty !== undefined) {
      options.presence_penalty = request.presence_penalty;
    }
    if (request.stop !== undefined) {
      options.stop = Array.isArray(request.stop) ? request.stop : [request.stop];
    }

    // Handle reasoning
    let think: { value: string | boolean } | undefined;
    const effort = request.reasoning?.effort || request.reasoning_effort;
    if (effort) {
      if (effort === "none") {
        think = { value: false };
      } else {
        think = { value: effort };
      }
    }

    // Handle response format (JSON mode)
    let format: unknown;
    if (request.response_format) {
      if (request.response_format.type === "json_object") {
        format = "json";
      } else if (request.response_format.type === "json_schema") {
        format = request.response_format.json_schema?.schema;
      }
    }

    // Convert tools
    const tools = request.tools?.map((t) => ({
      type: t.type,
      function: {
        name: t.function.name,
        description: t.function.description || "",
        parameters: t.function.parameters || {},
      },
    }));

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
   * Convert a message to Ollama format
   */
  private convertMessage(msg: ChatMessage): OllamaMessage {
    let content = "";
    let images: (string | number[]) | undefined;

    // Handle content
    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      for (const c of msg.content) {
        if (c.type === "text") {
          content += c.text;
        } else if (c.type === "image_url") {
          const url = typeof c.image_url === "string" ? c.image_url : c.image_url.url;
          // Decode base64 image
          const base64 = url.replace(/^data:image\/\w+;base64,/, "");
          images = images || [];
          images.push(base64);
        }
      }
    }

    // Handle tool calls
    let toolCalls;
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      toolCalls = msg.tool_calls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: {
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        },
      }));
    }

    return {
      role: msg.role as OllamaMessage["role"],
      content,
      ...(images && { images }),
      ...(toolCalls && { tool_calls: toolCalls }),
      ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
      ...(msg.name && { name: msg.name }),
    };
  }

  /**
   * Convert Ollama response to ChatCompletion response
   */
  private convertToResponse(
    request: ChatCompletionRequest,
    ollamaResponse: OllamaChatResponse
  ): ChatCompletionResponse {
    const responseId = this.generateId();

    // Convert tool calls back to OpenAI format
    const toolCalls = ollamaResponse.message.tool_calls?.map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.function.name,
        arguments: JSON.stringify(tc.function.arguments),
      },
    }));

    const finishReason = ollamaResponse.done_reason
      ? (ollamaResponse.done_reason === "stop"
        ? "stop"
        : ollamaResponse.done_reason === "tool_calls"
        ? "tool_calls"
        : "length")
      : "stop";

    return {
      id: responseId,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [
        {
          index: 0,
          message: {
            role: ollamaResponse.message.role as "assistant",
            content: ollamaResponse.message.content,
            ...(toolCalls && { tool_calls: toolCalls }),
          },
          finish_reason: finishReason,
        },
      ],
      usage: {
        prompt_tokens: ollamaResponse.metrics?.prompt_eval_count || 0,
        completion_tokens: ollamaResponse.metrics?.eval_count || 0,
        total_tokens:
          (ollamaResponse.metrics?.prompt_eval_count || 0) +
          (ollamaResponse.metrics?.eval_count || 0),
      },
    };
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}
