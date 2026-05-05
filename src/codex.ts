/**
 * TypeScript types for the Codex Responses API
 * Based on codex-rs/codex-api/src/common.rs
 */

// ============= Request Types =============

export interface Reasoning {
     effort?: ReasoningEffort;
     summary?: ReasoningSummary;
}

export type ReasoningEffort = "low" | "medium" | "high";

export interface ReasoningSummary {
     effort?: ReasoningSummaryEffort;
}

export type ReasoningSummaryEffort = "auto" | "low" | "medium" | "high";

export type TextFormatType = "json_schema";

export interface TextFormat {
     type: TextFormatType;
     strict: boolean;
     schema: Record<string, unknown>;
     name: string;
}

export type OpenAiVerbosity = "low" | "medium" | "high";

export interface TextControls {
     verbosity?: OpenAiVerbosity;
     format?: TextFormat;
}

export interface ResponseItem {
     type:
          | "message"
          | "function_tool_call"
          | "text"
          | "image"
          | "input"
          | "reasoning";
     id: string;
     status: "in_progress" | "completed" | "incomplete";
     content?: ContentItem[];
     role?: "user" | "assistant";
     name?: string;
     toolCalls?: ToolCall[];
     toolCallId?: string;
     outputIndex?: number;
     responseId?: string;
}

export type ContentItem =
     | TextContent
     | ImageContent
     | ToolUseContent
     | ToolResultContent
     | ReasoningContent;

export interface TextContent {
     type: "text";
     text: string;
}

export interface ImageContent {
     type: "image";
     source: {
          type: "base64" | "url";
          media_type: string;
          data: string;
     };
}

export interface ToolUseContent {
     type: "tool_use";
     id: string;
     name: string;
     input: Record<string, unknown>;
}

export interface ToolResultContent {
     type: "tool_result";
     tool_use_id: string;
     content: string;
     is_error?: boolean;
}

export interface ReasoningContent {
     type: "reasoning";
     reasoning: string;
}

export interface ToolCall {
     id: string;
     type: "function";
     function: {
          name: string;
          arguments: string;
     };
}

export interface ResponsesApiRequest {
     model: string;
     instructions: string;
     input: ResponseItem[];
     tools: Tool[];
     tool_choice: string;
     parallel_tool_calls: boolean;
     reasoning?: Reasoning;
     store: boolean;
     stream: boolean;
     include: string[];
     service_tier?: string;
     prompt_cache_key?: string;
     text?: TextControls;
     client_metadata?: Record<string, string>;
}

export interface Tool {
     type: "function";
     function: {
          name: string;
          description?: string;
          parameters?: Record<string, unknown>;
     };
}

// ============= Response Types =============

export type ResponseEvent =
     | ResponseEventCreated
     | ResponseEventOutputItemDone
     | ResponseEventOutputItemAdded
     | ResponseEventServerModel
     | ResponseEventModelVerifications
     | ResponseEventServerReasoningIncluded
     | ResponseEventCompleted
     | ResponseEventOutputTextDelta
     | ResponseEventToolCallInputDelta
     | ResponseEventReasoningSummaryDelta
     | ResponseEventReasoningContentDelta
     | ResponseEventReasoningSummaryPartAdded
     | ResponseEventRateLimits
     | ResponseEventModelsEtag;

export interface ResponseEventCreated {
     type: "created";
}

export interface ResponseEventOutputItemDone {
     type: "output_item_done";
     item: ResponseItem;
}

export interface ResponseEventOutputItemAdded {
     type: "output_item_added";
     item: ResponseItem;
}

export interface ResponseEventServerModel {
     type: "server_model";
     model: string;
}

export interface ResponseEventModelVerifications {
     type: "model_verifications";
     verifications: ModelVerification[];
}

export interface ModelVerification {
     id: string;
     expires_at?: string;
     verified?: boolean;
}

export interface ResponseEventServerReasoningIncluded {
     type: "server_reasoning_included";
     included: boolean;
}

export interface ResponseEventCompleted {
     type: "completed";
     response_id: string;
     token_usage?: TokenUsage;
     end_turn?: boolean;
}

export interface TokenUsage {
     input_tokens: number;
     output_tokens: number;
     total_tokens: number;
     input_token_details?: TokenUsageDetails;
     output_token_details?: TokenUsageDetails;
}

export interface TokenUsageDetails {
     cached_tokens?: number;
     reasoning_tokens?: number;
}

export interface ResponseEventOutputTextDelta {
     type: "output_text_delta";
     delta: string;
}

export interface ResponseEventToolCallInputDelta {
     type: "tool_call_input_delta";
     item_id: string;
     call_id?: string;
     delta: string;
}

export interface ResponseEventReasoningSummaryDelta {
     type: "reasoning_summary_delta";
     delta: string;
     summary_index: number;
}

export interface ResponseEventReasoningContentDelta {
     type: "reasoning_content_delta";
     delta: string;
     content_index: number;
}

export interface ResponseEventReasoningSummaryPartAdded {
     type: "reasoning_summary_part_added";
     summary_index: number;
}

export interface ResponseEventRateLimits {
     type: "rate_limits";
     limits: RateLimit[];
}

export interface RateLimit {
     name: string;
     limit: number;
     remaining: number;
     reset_at: string;
}

export interface ResponseEventModelsEtag {
     type: "models_etag";
     etag: string;
}

// ============= Streaming Types =============

export interface ResponseStream {
     rx_event: AsyncIterable<Result<ResponseEvent, ApiError>>;
     upstream_request_id?: string;
}

export interface ApiError {
     code?: string;
     message: string;
     status?: number;
}

// ============= WebSocket Request Types =============

export interface ResponseCreateWsRequest {
     model: string;
     instructions: string;
     previous_response_id?: string;
     input: ResponseItem[];
     tools: Tool[];
     tool_choice: string;
     parallel_tool_calls: boolean;
     reasoning?: Reasoning;
     store: boolean;
     stream: boolean;
     include: string[];
     service_tier?: string;
     prompt_cache_key?: string;
     text?: TextControls;
     generate?: boolean;
     client_metadata?: Record<string, string>;
}

export type ResponsesWsRequest =
     | { type: "response.create"; request: ResponseCreateWsRequest }
     | { type: "response.create"; previous_response_id: string };

// ============= Compact/Memory Endpoints =============

export interface CompactionInput {
     model: string;
     input: ResponseItem[];
     instructions: string;
     tools: Tool[];
     parallel_tool_calls: boolean;
     reasoning?: Reasoning;
     text?: TextControls;
}

export interface MemorySummarizeInput {
     model: string;
     traces: RawMemory[];
     reasoning?: Reasoning;
}

export interface RawMemory {
     id: string;
     metadata: RawMemoryMetadata;
     items: unknown[];
}

export interface RawMemoryMetadata {
     source_path: string;
}

export interface MemorySummarizeOutput {
     raw_memory?: string;
     memory_summary: string;
}

// ============= Client Options =============

export interface ResponsesOptions {
     conversation_id?: string;
     session_source?: SessionSource;
     extra_headers?: Record<string, string>;
     compression?: Compression;
     turn_state?: string;
}

export type SessionSource = "cli" | "tui" | "api";

export type Compression = "none" | "zstd";

// ============= Usage Example =============

/**
 * Example usage:
 *
 * ```typescript
 * const request: ResponsesApiRequest = {
 *   model: "llama3.2:3b",
 *   instructions: "You are a helpful coding assistant.",
 *   input: [
 *     {
 *       type: "message",
 *       id: "msg_001",
 *       status: "completed",
 *       role: "user",
 *       content: [
 *         { type: "text", text: "Hello, help me write a function." }
 *       ]
 *     }
 *   ],
 *   tools: [
 *     {
 *       type: "function",
 *       function: {
 *         name: "calculate",
 *         description: "Perform a calculation",
 *         parameters: {
 *           type: "object",
 *           properties: {
 *             expression: { type: "string" }
 *           },
 *           required: ["expression"]
 *         }
 *       }
 *     }
 *   ],
 *   tool_choice: "auto",
 *   parallel_tool_calls: true,
 *   store: false,
 *   stream: true,
 *   include: ["content.text", "content.transcript"]
 * };
 * ```
 */
