// src/types/new-respo.types.ts
// Zod schemas and types for OpenAI Responses API
// Based on https://developers.openai.com/api/reference/resources/responses/methods/create/index.md

import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────

/** Role of the message input */
export const MessageRoleSchema = z.enum([
     "user",
     "assistant",
     "system",
     "developer",
]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

/** Detail level for images/files */
export const DetailLevelSchema = z.enum(["low", "high", "auto", "original"]);
export type DetailLevel = z.infer<typeof DetailLevelSchema>;

/** Phase of the assistant message */
export const PhaseSchema = z.enum(["commentary", "final_answer"]);
export type Phase = z.infer<typeof PhaseSchema>;

/** Status of items */
export const ItemStatusSchema = z.enum([
     "in_progress",
     "completed",
     "incomplete",
]);
export type ItemStatus = z.infer<typeof ItemStatusSchema>;

/** Reasoning effort level */
export const ReasoningEffortSchema = z.enum([
     "none",
     "minimal",
     "low",
     "medium",
     "high",
     "xhigh",
]);
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

/** Summary type for reasoning */
export const SummaryTypeSchema = z.enum(["auto", "concise", "detailed"]);
export type SummaryType = z.infer<typeof SummaryTypeSchema>;

/** Text format type */
export const TextFormatTypeSchema = z.enum([
     "text",
     "json_schema",
     "json_object",
]);
export type TextFormatType = z.infer<typeof TextFormatTypeSchema>;

/** Verbosity level */
export const VerbositySchema = z.enum(["low", "medium", "high"]);
export type Verbosity = z.infer<typeof VerbositySchema>;

/** Truncation strategy */
export const TruncationSchema = z.enum(["auto", "disabled"]);
export type Truncation = z.infer<typeof TruncationSchema>;

/** Service tier */
export const ServiceTierSchema = z.enum([
     "auto",
     "default",
     "flex",
     "scale",
     "priority",
]);
export type ServiceTier = z.infer<typeof ServiceTierSchema>;

/** Prompt cache retention */
export const PromptCacheRetentionSchema = z.enum(["in_memory", "24h"]);
export type PromptCacheRetention = z.infer<typeof PromptCacheRetentionSchema>;

/** Computer environment type */
export const ComputerEnvironmentSchema = z.enum([
     "windows",
     "mac",
     "linux",
     "ubuntu",
     "browser",
]);
export type ComputerEnvironment = z.infer<typeof ComputerEnvironmentSchema>;

/** Image generation model */
export const ImageGenerationModelSchema = z.enum([
     "gpt-image-1",
     "gpt-image-1-mini",
     "gpt-image-1.5",
]);
export type ImageGenerationModel = z.infer<typeof ImageGenerationModelSchema>;

/** Image size */
export const ImageSizeSchema = z.enum([
     "1024x1024",
     "1024x1536",
     "1536x1024",
     "auto",
]);
export type ImageSize = z.infer<typeof ImageSizeSchema>;

/** Image quality */
export const ImageQualitySchema = z.enum(["low", "medium", "high", "auto"]);
export type ImageQuality = z.infer<typeof ImageQualitySchema>;

/** Image format */
export const ImageFormatSchema = z.enum(["png", "webp", "jpeg"]);
export type ImageFormat = z.infer<typeof ImageFormatSchema>;

/** Image background */
export const ImageBackgroundSchema = z.enum(["transparent", "opaque", "auto"]);
export type ImageBackground = z.infer<typeof ImageBackgroundSchema>;

/** Image action */
export const ImageActionSchema = z.enum(["generate", "edit", "auto"]);
export type ImageAction = z.infer<typeof ImageActionSchema>;

/** Input fidelity */
export const InputFidelitySchema = z.enum(["high", "low"]);
export type InputFidelity = z.infer<typeof InputFidelitySchema>;

/** Moderation level */
export const ModerationLevelSchema = z.enum(["auto", "low"]);
export type ModerationLevel = z.infer<typeof ModerationLevelSchema>;

/** Code interpreter memory limit */
export const MemoryLimitSchema = z.enum(["1g", "4g", "16g", "64g"]);
export type MemoryLimit = z.infer<typeof MemoryLimitSchema>;

/** Tool choice type */
export const ToolChoiceTypeSchema = z.enum([
     "none",
     "auto",
     "required",
     "file_search",
     "web_search_preview",
     "computer",
     "computer_use_preview",
     "computer_use",
     "web_search_preview_2025_03_11",
     "image_generation",
     "code_interpreter",
     "apply_patch",
     "shell",
]);
export type ToolChoiceType = z.infer<typeof ToolChoiceTypeSchema>;

/** Web search type */
export const WebSearchTypeSchema = z.enum([
     "web_search",
     "web_search_2025_08_26",
]);
export type WebSearchType = z.infer<typeof WebSearchTypeSchema>;

/** Web search preview type */
export const WebSearchPreviewTypeSchema = z.enum([
     "web_search_preview",
     "web_search_preview_2025_03_11",
]);
export type WebSearchPreviewType = z.infer<typeof WebSearchPreviewTypeSchema>;

/** Search context size */
export const SearchContextSizeSchema = z.enum(["low", "medium", "high"]);
export type SearchContextSize = z.infer<typeof SearchContextSizeSchema>;

/** Comparison filter type */
export const ComparisonFilterTypeSchema = z.enum([
     "eq",
     "ne",
     "gt",
     "gte",
     "lt",
     "lte",
     "in",
     "nin",
]);
export type ComparisonFilterType = z.infer<typeof ComparisonFilterTypeSchema>;

/** Compound filter type */
export const CompoundFilterTypeSchema = z.enum(["and", "or"]);
export type CompoundFilterType = z.infer<typeof CompoundFilterTypeSchema>;

/** Ranker type */
export const RankerSchema = z.enum(["auto", "default-2024-11-15"]);
export type Ranker = z.infer<typeof RankerSchema>;

/** Connector IDs */
export const ConnectorIdSchema = z.enum([
     "connector_dropbox",
     "connector_gmail",
     "connector_googlecalendar",
     "connector_googledrive",
     "connector_microsoftteams",
     "connector_outlookcalendar",
     "connector_outlookemail",
     "connector_sharepoint",
]);
export type ConnectorId = z.infer<typeof ConnectorIdSchema>;

/** MCP tool approval setting */
export const McpToolApprovalSettingSchema = z.enum(["always", "never"]);
export type McpToolApprovalSetting = z.infer<
     typeof McpToolApprovalSettingSchema
>;

/** User location type */
export const UserLocationTypeSchema = z.literal("approximate");
export type UserLocationType = z.infer<typeof UserLocationTypeSchema>;

/** File search call status */
export const FileSearchCallStatusSchema = z.enum([
     "in_progress",
     "searching",
     "completed",
     "incomplete",
     "failed",
]);
export type FileSearchCallStatus = z.infer<typeof FileSearchCallStatusSchema>;

/** Web search call status */
export const WebSearchCallStatusSchema = z.enum([
     "in_progress",
     "searching",
     "completed",
     "failed",
]);
export type WebSearchCallStatus = z.infer<typeof WebSearchCallStatusSchema>;

/** Code interpreter call status */
export const CodeInterpreterCallStatusSchema = z.enum([
     "in_progress",
     "completed",
     "incomplete",
     "interpreting",
     "failed",
]);
export type CodeInterpreterCallStatus = z.infer<
     typeof CodeInterpreterCallStatusSchema
>;

/** Image generation call status */
export const ImageGenerationCallStatusSchema = z.enum([
     "in_progress",
     "completed",
     "generating",
     "failed",
]);
export type ImageGenerationCallStatus = z.infer<
     typeof ImageGenerationCallStatusSchema
>;

/** Apply patch call status */
export const ApplyPatchCallStatusSchema = z.enum(["in_progress", "completed"]);
export type ApplyPatchCallStatus = z.infer<typeof ApplyPatchCallStatusSchema>;

/** Shell call status */
export const ShellCallStatusSchema = z.enum([
     "in_progress",
     "completed",
     "incomplete",
]);
export type ShellCallStatus = z.infer<typeof ShellCallStatusSchema>;

/** Apply patch operation type */
export const ApplyPatchOperationTypeSchema = z.enum([
     "create_file",
     "delete_file",
     "update_file",
]);
export type ApplyPatchOperationType = z.infer<
     typeof ApplyPatchOperationTypeSchema
>;

/** Outcome type */
export const OutcomeTypeSchema = z.enum(["timeout", "exit"]);
export type OutcomeType = z.infer<typeof OutcomeTypeSchema>;

/** Tool execution type */
export const ExecutionTypeSchema = z.enum(["server", "client"]);
export type ExecutionType = z.infer<typeof ExecutionTypeSchema>;

/** Response status */
export const ResponseStatusSchema = z.enum([
     "completed",
     "failed",
     "in_progress",
     "cancelled",
     "queued",
     "incomplete",
]);
export type ResponseStatus = z.infer<typeof ResponseStatusSchema>;

/** Error code */
export const ResponseErrorCodeSchema = z.enum([
     "server_error",
     "rate_limit_exceeded",
     "invalid_prompt",
     "vector_store_timeout",
     "invalid_image",
     "invalid_image_format",
     "invalid_base64_image",
     "invalid_image_url",
     "image_too_large",
     "image_too_small",
     "image_parse_error",
     "image_content_policy_violation",
     "invalid_image_mode",
     "image_file_too_large",
     "unsupported_image_media_type",
     "empty_image_file",
     "failed_to_download_image",
     "image_file_not_found",
]);
export type ResponseErrorCode = z.infer<typeof ResponseErrorCodeSchema>;

/** Incomplete details reason */
export const IncompleteDetailsReasonSchema = z.enum([
     "max_output_tokens",
     "content_filter",
]);
export type IncompleteDetailsReason = z.infer<
     typeof IncompleteDetailsReasonSchema
>;

/** Include types */
export const ResponseIncludableSchema = z.enum([
     "web_search_call.action.sources",
     "code_interpreter_call.outputs",
     "computer_call_output.output.image_url",
     "file_search_call.results",
     "message.input_image.image_url",
     "message.output_text.logprobs",
     "reasoning.encrypted_content",
     "file_search_call.results",
     "web_search_call.results",
     "web_search_call.action.sources",
     "message.input_image.image_url",
     "computer_call_output.output.image_url",
     "code_interpreter_call.outputs",
     "reasoning.encrypted_content",
     "message.output_text.logprobs",
]);
export type ResponseIncludable = z.infer<typeof ResponseIncludableSchema>;

// ─────────────────────────────────────────────────────────────
// Utility Types
// ─────────────────────────────────────────────────────────────

/** Metadata - key-value pairs */
export const MetadataSchema = z.record(z.string(), z.string());
export type Metadata = z.infer<typeof MetadataSchema>;

// ─────────────────────────────────────────────────────────────
// Input Content Types
// ─────────────────────────────────────────────────────────────

/** Text input content */
export const ResponseInputTextSchema = z.object({
     type: z.literal("input_text"),
     text: z.string(),
});
export type ResponseInputText = z.infer<typeof ResponseInputTextSchema>;

/** Image input content */
export const ResponseInputImageSchema = z.object({
     type: z.literal("input_image"),
     detail: DetailLevelSchema.optional(),
     file_id: z.string().optional(),
     image_url: z.string().optional(),
});
export type ResponseInputImage = z.infer<typeof ResponseInputImageSchema>;

/** File input content */
export const ResponseInputFileSchema = z.object({
     type: z.literal("input_file"),
     detail: z.enum(["low", "high"]).optional(),
     file_data: z.string().optional(),
     file_id: z.string().optional(),
     file_url: z.string().optional(),
     filename: z.string().optional(),
});
export type ResponseInputFile = z.infer<typeof ResponseInputFileSchema>;

/** Input content union */
export const ResponseInputContentSchema = z.discriminatedUnion("type", [
     ResponseInputTextSchema,
     ResponseInputImageSchema,
     ResponseInputFileSchema,
]);
export type ResponseInputContent = z.infer<typeof ResponseInputContentSchema>;

/** Input message content list */
export const ResponseInputMessageContentListSchema = z.array(
     ResponseInputContentSchema,
);
export type ResponseInputMessageContentList = z.infer<
     typeof ResponseInputMessageContentListSchema
>;

// ─────────────────────────────────────────────────────────────
// Input Messages
// ─────────────────────────────────────────────────────────────

/** Easy input message (simplified) */
export const EasyInputMessageSchema = z.object({
     type: z.literal("message").optional(),
     role: MessageRoleSchema,
     content: z
          .union([z.string(), ResponseInputMessageContentListSchema])
          .optional(),
     phase: PhaseSchema.optional(),
});
export type EasyInputMessage = z.infer<typeof EasyInputMessageSchema>;

/** Full message input */
export const MessageSchema = z.object({
     type: z.literal("message").optional(),
     role: MessageRoleSchema.exclude(["assistant"]),
     content: ResponseInputMessageContentListSchema,
     status: ItemStatusSchema.optional(),
});
export type Message = z.infer<typeof MessageSchema>;

/** Input item union */
export const InputItemSchema = z.union([EasyInputMessageSchema, MessageSchema]);
export type InputItem = z.infer<typeof InputItemSchema>;

/** Input can be string or array of items */
export const InputSchema = z.union([z.string(), z.array(InputItemSchema)]);
export type Input = z.infer<typeof InputSchema>;

// ─────────────────────────────────────────────────────────────
// Output Content Types
// ─────────────────────────────────────────────────────────────

/** File citation annotation */
export const FileCitationSchema = z.object({
     type: z.literal("file_citation"),
     file_id: z.string(),
     filename: z.string(),
     index: z.number(),
});
export type FileCitation = z.infer<typeof FileCitationSchema>;

/** URL citation annotation */
export const URLCitationSchema = z.object({
     type: z.literal("url_citation"),
     url: z.string(),
     title: z.string(),
     start_index: z.number(),
     end_index: z.number(),
});
export type URLCitation = z.infer<typeof URLCitationSchema>;

/** Container file citation */
export const ContainerFileCitationSchema = z.object({
     type: z.literal("container_file_citation"),
     container_id: z.string(),
     file_id: z.string(),
     filename: z.string(),
     start_index: z.number(),
     end_index: z.number(),
});
export type ContainerFileCitation = z.infer<typeof ContainerFileCitationSchema>;

/** File path annotation */
export const FilePathSchema = z.object({
     type: z.literal("file_path"),
     file_id: z.string(),
     index: z.number(),
});
export type FilePath = z.infer<typeof FilePathSchema>;

/** Text output annotation union */
export const TextAnnotationSchema = z.discriminatedUnion("type", [
     FileCitationSchema,
     URLCitationSchema,
     ContainerFileCitationSchema,
     FilePathSchema,
]);
export type TextAnnotation = z.infer<typeof TextAnnotationSchema>;

/** Logprob entry */
export const LogprobEntrySchema = z.object({
     token: z.string(),
     bytes: z.array(z.number()),
     logprob: z.number(),
     top_logprobs: z
          .array(
               z.object({
                    token: z.string(),
                    bytes: z.array(z.number()),
                    logprob: z.number(),
               }),
          )
          .optional(),
});
export type LogprobEntry = z.infer<typeof LogprobEntrySchema>;

/** Output text content */
export const ResponseOutputTextSchema = z.object({
     type: z.literal("output_text"),
     text: z.string(),
     annotations: z.array(TextAnnotationSchema).optional(),
     logprobs: z.array(LogprobEntrySchema).optional(),
});
export type ResponseOutputText = z.infer<typeof ResponseOutputTextSchema>;

/** Refusal content */
export const ResponseOutputRefusalSchema = z.object({
     type: z.literal("refusal"),
     refusal: z.string(),
});
export type ResponseOutputRefusal = z.infer<typeof ResponseOutputRefusalSchema>;

/** Output content union */
export const ResponseOutputContentSchema = z.discriminatedUnion("type", [
     ResponseOutputTextSchema,
     ResponseOutputRefusalSchema,
]);
export type ResponseOutputContent = z.infer<typeof ResponseOutputContentSchema>;

// ─────────────────────────────────────────────────────────────
// Output Messages
// ─────────────────────────────────────────────────────────────

/** Output message */
export const ResponseOutputMessageSchema = z.object({
     type: z.literal("message"),
     id: z.string(),
     role: z.literal("assistant"),
     content: z.array(ResponseOutputContentSchema),
     status: ItemStatusSchema,
     phase: PhaseSchema.optional(),
});
export type ResponseOutputMessage = z.infer<typeof ResponseOutputMessageSchema>;

// ─────────────────────────────────────────────────────────────
// Reasoning
// ─────────────────────────────────────────────────────────────

/** Summary text content */
export const SummaryTextContentSchema = z.object({
     type: z.literal("summary_text"),
     text: z.string(),
});
export type SummaryTextContent = z.infer<typeof SummaryTextContentSchema>;

/** Reasoning text content */
export const ReasoningTextContentSchema = z.object({
     type: z.literal("reasoning_text"),
     text: z.string(),
});
export type ReasoningTextContent = z.infer<typeof ReasoningTextContentSchema>;

/** Reasoning item */
export const ReasoningSchema = z.object({
     type: z.literal("reasoning"),
     id: z.string(),
     summary: z.array(SummaryTextContentSchema),
     content: z.array(ReasoningTextContentSchema).optional(),
     encrypted_content: z.string().optional(),
     status: ItemStatusSchema.optional(),
});
export type Reasoning = z.infer<typeof ReasoningSchema>;

// ─────────────────────────────────────────────────────────────
// File Search
// ─────────────────────────────────────────────────────────────

/** File search result */
export const FileSearchResultSchema = z.object({
     file_id: z.string().optional(),
     filename: z.string().optional(),
     text: z.string().optional(),
     score: z.number().optional(),
     attributes: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional(),
});
export type FileSearchResult = z.infer<typeof FileSearchResultSchema>;

/** File search call */
export const FileSearchCallSchema = z.object({
     type: z.literal("file_search_call"),
     id: z.string(),
     queries: z.array(z.string()),
     status: FileSearchCallStatusSchema,
     results: z.array(FileSearchResultSchema).optional(),
});
export type FileSearchCall = z.infer<typeof FileSearchCallSchema>;

// ─────────────────────────────────────────────────────────────
// Web Search
// ─────────────────────────────────────────────────────────────

/** Web search source */
export const WebSearchSourceSchema = z.object({
     type: z.literal("url"),
     url: z.string(),
});
export type WebSearchSource = z.infer<typeof WebSearchSourceSchema>;

/** Web search action - search */
export const WebSearchActionSearchSchema = z.object({
     type: z.literal("search"),
     query: z.string().optional(),
     queries: z.array(z.string()).optional(),
     sources: z.array(WebSearchSourceSchema).optional(),
});
export type WebSearchActionSearch = z.infer<typeof WebSearchActionSearchSchema>;

/** Web search action - open page */
export const WebSearchActionOpenPageSchema = z.object({
     type: z.literal("open_page"),
     url: z.string().optional(),
});
export type WebSearchActionOpenPage = z.infer<
     typeof WebSearchActionOpenPageSchema
>;

/** Web search action - find in page */
export const WebSearchActionFindInPageSchema = z.object({
     type: z.literal("find_in_page"),
     pattern: z.string(),
     url: z.string(),
});
export type WebSearchActionFindInPage = z.infer<
     typeof WebSearchActionFindInPageSchema
>;

/** Web search action union */
export const WebSearchActionSchema = z.discriminatedUnion("type", [
     WebSearchActionSearchSchema,
     WebSearchActionOpenPageSchema,
     WebSearchActionFindInPageSchema,
]);
export type WebSearchAction = z.infer<typeof WebSearchActionSchema>;

/** Web search call */
export const WebSearchCallSchema = z.object({
     type: z.literal("web_search_call"),
     id: z.string(),
     action: WebSearchActionSchema,
     status: WebSearchCallStatusSchema,
});
export type WebSearchCall = z.infer<typeof WebSearchCallSchema>;

// ─────────────────────────────────────────────────────────────
// Function Calling
// ─────────────────────────────────────────────────────────────

/** Function call */
export const FunctionCallSchema = z.object({
     type: z.literal("function_call"),
     id: z.string().optional(),
     call_id: z.string(),
     name: z.string(),
     arguments: z.string(),
     namespace: z.string().optional(),
     status: ItemStatusSchema.optional(),
});
export type FunctionCall = z.infer<typeof FunctionCallSchema>;

/** Function call output */
export const FunctionCallOutputSchema = z.object({
     type: z.literal("function_call_output"),
     id: z.string().optional(),
     call_id: z.string(),
     output: z.union([z.string(), z.array(ResponseInputContentSchema)]),
     status: ItemStatusSchema.optional(),
});
export type FunctionCallOutput = z.infer<typeof FunctionCallOutputSchema>;

// ─────────────────────────────────────────────────────────────
// Computer Tool
// ─────────────────────────────────────────────────────────────

/** Computer action - click */
export const ComputerActionClickSchema = z.object({
     type: z.literal("click"),
     button: z.enum(["left", "right", "wheel", "back", "forward"]),
     x: z.number(),
     y: z.number(),
     keys: z.array(z.string()).optional(),
});
export type ComputerActionClick = z.infer<typeof ComputerActionClickSchema>;

/** Computer action - double click */
export const ComputerActionDoubleClickSchema = z.object({
     type: z.literal("double_click"),
     x: z.number(),
     y: z.number(),
     keys: z.array(z.string()),
});
export type ComputerActionDoubleClick = z.infer<
     typeof ComputerActionDoubleClickSchema
>;

/** Computer action - drag */
export const ComputerActionDragSchema = z.object({
     type: z.literal("drag"),
     path: z.array(z.object({ x: z.number(), y: z.number() })),
     keys: z.array(z.string()).optional(),
});
export type ComputerActionDrag = z.infer<typeof ComputerActionDragSchema>;

/** Computer action - keypress */
export const ComputerActionKeypressSchema = z.object({
     type: z.literal("keypress"),
     keys: z.array(z.string()),
});
export type ComputerActionKeypress = z.infer<
     typeof ComputerActionKeypressSchema
>;

/** Computer action - move */
export const ComputerActionMoveSchema = z.object({
     type: z.literal("move"),
     x: z.number(),
     y: z.number(),
     keys: z.array(z.string()).optional(),
});
export type ComputerActionMove = z.infer<typeof ComputerActionMoveSchema>;

/** Computer action - screenshot */
export const ComputerActionScreenshotSchema = z.object({
     type: z.literal("screenshot"),
});
export type ComputerActionScreenshot = z.infer<
     typeof ComputerActionScreenshotSchema
>;

/** Computer action - scroll */
export const ComputerActionScrollSchema = z.object({
     type: z.literal("scroll"),
     scroll_x: z.number(),
     scroll_y: z.number(),
     x: z.number(),
     y: z.number(),
     keys: z.array(z.string()).optional(),
});
export type ComputerActionScroll = z.infer<typeof ComputerActionScrollSchema>;

/** Computer action - type */
export const ComputerActionTypeSchema = z.object({
     type: z.literal("type"),
     text: z.string(),
});
export type ComputerActionType = z.infer<typeof ComputerActionTypeSchema>;

/** Computer action - wait */
export const ComputerActionWaitSchema = z.object({
     type: z.literal("wait"),
});
export type ComputerActionWait = z.infer<typeof ComputerActionWaitSchema>;

/** Computer action union */
export const ComputerActionSchema = z.discriminatedUnion("type", [
     ComputerActionClickSchema,
     ComputerActionDoubleClickSchema,
     ComputerActionDragSchema,
     ComputerActionKeypressSchema,
     ComputerActionMoveSchema,
     ComputerActionScreenshotSchema,
     ComputerActionScrollSchema,
     ComputerActionTypeSchema,
     ComputerActionWaitSchema,
]);
export type ComputerAction = z.infer<typeof ComputerActionSchema>;

/** Safety check */
export const SafetyCheckSchema = z.object({
     id: z.string(),
     code: z.string().optional(),
     message: z.string().optional(),
});
export type SafetyCheck = z.infer<typeof SafetyCheckSchema>;

/** Computer call */
export const ComputerCallSchema = z.object({
     type: z.literal("computer_call"),
     id: z.string(),
     call_id: z.string(),
     action: ComputerActionSchema.optional(),
     actions: z.array(ComputerActionSchema).optional(),
     pending_safety_checks: z.array(SafetyCheckSchema),
     status: ItemStatusSchema,
});
export type ComputerCall = z.infer<typeof ComputerCallSchema>;

/** Computer call output - screenshot */
export const ResponseComputerToolCallOutputScreenshotSchema = z.object({
     type: z.literal("computer_screenshot"),
     image_url: z.string().optional(),
     file_id: z.string().optional(),
});
export type ResponseComputerToolCallOutputScreenshot = z.infer<
     typeof ResponseComputerToolCallOutputScreenshotSchema
>;

/** Computer call output */
export const ComputerCallOutputSchema = z.object({
     type: z.literal("computer_call_output"),
     id: z.string().optional(),
     call_id: z.string(),
     output: ResponseComputerToolCallOutputScreenshotSchema,
     acknowledged_safety_checks: z.array(SafetyCheckSchema).optional(),
     status: ItemStatusSchema.optional(),
});
export type ComputerCallOutput = z.infer<typeof ComputerCallOutputSchema>;

// ─────────────────────────────────────────────────────────────
// Code Interpreter
// ─────────────────────────────────────────────────────────────

/** Code interpreter output - logs */
export const CodeInterpreterLogsSchema = z.object({
     type: z.literal("logs"),
     logs: z.string(),
});
export type CodeInterpreterLogs = z.infer<typeof CodeInterpreterLogsSchema>;

/** Code interpreter output - image */
export const CodeInterpreterImageSchema = z.object({
     type: z.literal("image"),
     url: z.string(),
});
export type CodeInterpreterImage = z.infer<typeof CodeInterpreterImageSchema>;

/** Code interpreter output union */
export const CodeInterpreterOutputSchema = z.discriminatedUnion("type", [
     CodeInterpreterLogsSchema,
     CodeInterpreterImageSchema,
]);
export type CodeInterpreterOutput = z.infer<typeof CodeInterpreterOutputSchema>;

/** Code interpreter call */
export const CodeInterpreterCallSchema = z.object({
     type: z.literal("code_interpreter_call"),
     id: z.string(),
     code: z.string(),
     container_id: z.string(),
     outputs: z.array(CodeInterpreterOutputSchema).optional(),
     status: CodeInterpreterCallStatusSchema,
});
export type CodeInterpreterCall = z.infer<typeof CodeInterpreterCallSchema>;

// ─────────────────────────────────────────────────────────────
// Image Generation
// ─────────────────────────────────────────────────────────────

/** Image generation call */
export const ImageGenerationCallSchema = z.object({
     type: z.literal("image_generation_call"),
     id: z.string(),
     result: z.string(),
     status: ImageGenerationCallStatusSchema,
});
export type ImageGenerationCall = z.infer<typeof ImageGenerationCallSchema>;

// ─────────────────────────────────────────────────────────────
// Custom Tool
// ─────────────────────────────────────────────────────────────

/** Custom tool call */
export const CustomToolCallSchema = z.object({
     type: z.literal("custom_tool_call"),
     id: z.string().optional(),
     call_id: z.string(),
     name: z.string(),
     input: z.string(),
     namespace: z.string().optional(),
});
export type CustomToolCall = z.infer<typeof CustomToolCallSchema>;

/** Custom tool call output */
export const CustomToolCallOutputSchema = z.object({
     type: z.literal("custom_tool_call_output"),
     id: z.string().optional(),
     call_id: z.string(),
     output: z.union([z.string(), z.array(ResponseInputContentSchema)]),
     status: ItemStatusSchema.optional(),
});
export type CustomToolCallOutput = z.infer<typeof CustomToolCallOutputSchema>;

// ─────────────────────────────────────────────────────────────
// Shell Tool
// ─────────────────────────────────────────────────────────────

/** Shell call action */
export const ShellCallActionSchema = z.object({
     type: z.literal("exec"),
     commands: z.array(z.string()),
     max_output_length: z.number().optional(),
     timeout_ms: z.number().optional(),
});
export type ShellCallAction = z.infer<typeof ShellCallActionSchema>;

/** Shell call */
export const ShellCallSchema = z.object({
     type: z.literal("shell_call"),
     id: z.string().optional(),
     call_id: z.string(),
     action: ShellCallActionSchema,
     status: ShellCallStatusSchema.optional(),
});
export type ShellCall = z.infer<typeof ShellCallSchema>;

/** Shell call output - outcome */
export const OutcomeTimeoutSchema = z.object({
     type: z.literal("timeout"),
});
export type OutcomeTimeout = z.infer<typeof OutcomeTimeoutSchema>;

/** Shell call output - exit */
export const OutcomeExitSchema = z.object({
     type: z.literal("exit"),
     exit_code: z.number(),
});
export type OutcomeExit = z.infer<typeof OutcomeExitSchema>;

/** Shell call output outcome union */
export const ShellCallOutcomeSchema = z.discriminatedUnion("type", [
     OutcomeTimeoutSchema,
     OutcomeExitSchema,
]);
export type ShellCallOutcome = z.infer<typeof ShellCallOutcomeSchema>;

/** Shell call output content */
export const ShellCallOutputContentSchema = z.object({
     stdout: z.string(),
     stderr: z.string(),
     outcome: ShellCallOutcomeSchema,
});
export type ShellCallOutputContent = z.infer<
     typeof ShellCallOutputContentSchema
>;

/** Shell call output */
export const ShellCallOutputSchema = z.object({
     type: z.literal("shell_call_output"),
     id: z.string().optional(),
     call_id: z.string(),
     output: z.array(ShellCallOutputContentSchema),
     max_output_length: z.number().optional(),
     status: ShellCallStatusSchema.optional(),
});
export type ShellCallOutput = z.infer<typeof ShellCallOutputSchema>;

// ─────────────────────────────────────────────────────────────
// Apply Patch Tool
// ─────────────────────────────────────────────────────────────

/** Apply patch operation - create file */
export const ApplyPatchOperationCreateSchema = z.object({
     type: z.literal("create_file"),
     path: z.string(),
     diff: z.string(),
});
export type ApplyPatchOperationCreate = z.infer<
     typeof ApplyPatchOperationCreateSchema
>;

/** Apply patch operation - delete file */
export const ApplyPatchOperationDeleteSchema = z.object({
     type: z.literal("delete_file"),
     path: z.string(),
});
export type ApplyPatchOperationDelete = z.infer<
     typeof ApplyPatchOperationDeleteSchema
>;

/** Apply patch operation - update file */
export const ApplyPatchOperationUpdateSchema = z.object({
     type: z.literal("update_file"),
     path: z.string(),
     diff: z.string(),
});
export type ApplyPatchOperationUpdate = z.infer<
     typeof ApplyPatchOperationUpdateSchema
>;

/** Apply patch operation union */
export const ApplyPatchOperationSchema = z.discriminatedUnion("type", [
     ApplyPatchOperationCreateSchema,
     ApplyPatchOperationDeleteSchema,
     ApplyPatchOperationUpdateSchema,
]);
export type ApplyPatchOperation = z.infer<typeof ApplyPatchOperationSchema>;

/** Apply patch call */
export const ApplyPatchCallSchema = z.object({
     type: z.literal("apply_patch_call"),
     id: z.string().optional(),
     call_id: z.string(),
     operation: ApplyPatchOperationSchema,
     status: ApplyPatchCallStatusSchema,
});
export type ApplyPatchCall = z.infer<typeof ApplyPatchCallSchema>;

/** Apply patch call output */
export const ApplyPatchCallOutputSchema = z.object({
     type: z.literal("apply_patch_call_output"),
     id: z.string().optional(),
     call_id: z.string(),
     status: z.enum(["completed", "failed"]),
     output: z.string().optional(),
});
export type ApplyPatchCallOutput = z.infer<typeof ApplyPatchCallOutputSchema>;

// ─────────────────────────────────────────────────────────────
// MCP Tool
// ─────────────────────────────────────────────────────────────

/** MCP tool filter */
export const McpToolFilterSchema = z.object({
     read_only: z.boolean().optional(),
     tool_names: z.array(z.string()).optional(),
});
export type McpToolFilter = z.infer<typeof McpToolFilterSchema>;

/** MCP tool approval filter */
export const McpToolApprovalFilterSchema = z.object({
     always: McpToolFilterSchema.optional(),
     never: McpToolFilterSchema.optional(),
});
export type McpToolApprovalFilter = z.infer<typeof McpToolApprovalFilterSchema>;

/** MCP allowed tools */
export const McpAllowedToolsSchema = z.union([
     z.array(z.string()),
     McpToolFilterSchema,
]);
export type McpAllowedTools = z.infer<typeof McpAllowedToolsSchema>;

/** MCP call */
export const McpCallSchema = z.object({
     type: z.literal("mcp_call"),
     id: z.string(),
     call_id: z.string().optional(),
     name: z.string(),
     arguments: z.string(),
     server_label: z.string(),
     approval_request_id: z.string().optional(),
     error: z.string().optional(),
     output: z.string().optional(),
     status: ItemStatusSchema.optional(),
});
export type McpCall = z.infer<typeof McpCallSchema>;

/** MCP list tools */
export const McpListToolsSchema = z.object({
     type: z.literal("mcp_list_tools"),
     id: z.string(),
     server_label: z.string(),
     tools: z.array(
          z.object({
               name: z.string(),
               description: z.string().optional(),
               input_schema: z.unknown(),
               annotations: z.unknown().optional(),
          }),
     ),
     error: z.string().optional(),
});
export type McpListTools = z.infer<typeof McpListToolsSchema>;

/** MCP approval request */
export const McpApprovalRequestSchema = z.object({
     type: z.literal("mcp_approval_request"),
     id: z.string(),
     name: z.string(),
     arguments: z.string(),
     server_label: z.string(),
});
export type McpApprovalRequest = z.infer<typeof McpApprovalRequestSchema>;

/** MCP approval response */
export const McpApprovalResponseSchema = z.object({
     type: z.literal("mcp_approval_response"),
     id: z.string().optional(),
     approval_request_id: z.string(),
     approve: z.boolean(),
     reason: z.string().optional(),
});
export type McpApprovalResponse = z.infer<typeof McpApprovalResponseSchema>;

// ─────────────────────────────────────────────────────────────
// Tool Definitions
// ─────────────────────────────────────────────────────────────

/** User location */
export const UserLocationSchema = z.object({
     type: UserLocationTypeSchema,
     city: z.string().optional(),
     country: z.string().optional(),
     region: z.string().optional(),
     timezone: z.string().optional(),
});
export type UserLocation = z.infer<typeof UserLocationSchema>;

/** Web search filters */
export const WebSearchFiltersSchema = z.object({
     allowed_domains: z.array(z.string()).optional(),
});
export type WebSearchFilters = z.infer<typeof WebSearchFiltersSchema>;

/** Hybrid search options */
export const HybridSearchSchema = z.object({
     embedding_weight: z.number(),
     text_weight: z.number(),
});
export type HybridSearch = z.infer<typeof HybridSearchSchema>;

/** Ranking options */
export const RankingOptionsSchema = z.object({
     hybrid_search: HybridSearchSchema.optional(),
     ranker: RankerSchema.optional(),
     score_threshold: z.number().optional(),
});
export type RankingOptions = z.infer<typeof RankingOptionsSchema>;

/** Comparison filter */
export const ComparisonFilterSchema = z.object({
     key: z.string(),
     type: ComparisonFilterTypeSchema,
     value: z.union([
          z.string(),
          z.number(),
          z.boolean(),
          z.array(z.string()),
          z.array(z.number()),
     ]),
});
export type ComparisonFilter = z.infer<typeof ComparisonFilterSchema>;

/** Compound filter */
export const CompoundFilterSchema = z.object({
     type: CompoundFilterTypeSchema,
     filters: z.array(z.union([ComparisonFilterSchema, z.unknown()])),
});
export type CompoundFilter = z.infer<typeof CompoundFilterSchema>;

/** File search filter */
export const FileSearchFilterSchema = z.union([
     ComparisonFilterSchema,
     CompoundFilterSchema,
]);
export type FileSearchFilter = z.infer<typeof FileSearchFilterSchema>;

/** Container network policy - disabled */
export const ContainerNetworkPolicyDisabledSchema = z.object({
     type: z.literal("disabled"),
});
export type ContainerNetworkPolicyDisabled = z.infer<
     typeof ContainerNetworkPolicyDisabledSchema
>;

/** Container network policy - allowlist */
export const ContainerNetworkPolicyDomainSecretSchema = z.object({
     domain: z.string(),
     name: z.string(),
     value: z.string(),
});
export type ContainerNetworkPolicyDomainSecret = z.infer<
     typeof ContainerNetworkPolicyDomainSecretSchema
>;

export const ContainerNetworkPolicyAllowlistSchema = z.object({
     type: z.literal("allowlist"),
     allowed_domains: z.array(z.string()),
     domain_secrets: z
          .array(ContainerNetworkPolicyDomainSecretSchema)
          .optional(),
});
export type ContainerNetworkPolicyAllowlist = z.infer<
     typeof ContainerNetworkPolicyAllowlistSchema
>;

/** Container network policy union */
export const ContainerNetworkPolicySchema = z.union([
     ContainerNetworkPolicyDisabledSchema,
     ContainerNetworkPolicyAllowlistSchema,
]);
export type ContainerNetworkPolicy = z.infer<
     typeof ContainerNetworkPolicySchema
>;

/** Code interpreter tool auto */
export const CodeInterpreterToolAutoSchema = z.object({
     type: z.literal("auto"),
     file_ids: z.array(z.string()).optional(),
     memory_limit: MemoryLimitSchema.optional(),
     network_policy: ContainerNetworkPolicySchema.optional(),
});
export type CodeInterpreterToolAuto = z.infer<
     typeof CodeInterpreterToolAutoSchema
>;

/** Code interpreter container */
export const CodeInterpreterContainerSchema = z.union([
     z.string(),
     CodeInterpreterToolAutoSchema,
]);
export type CodeInterpreterContainer = z.infer<
     typeof CodeInterpreterContainerSchema
>;

/** Image input mask */
export const ImageInputMaskSchema = z.object({
     file_id: z.string().optional(),
     image_url: z.string().optional(),
});
export type ImageInputMask = z.infer<typeof ImageInputMaskSchema>;

// ─────────────────────────────────────────────────────────────
// Complete Tool Definitions
// ─────────────────────────────────────────────────────────────

/** Function tool definition */
export const FunctionToolSchema = z.object({
     type: z.literal("function"),
     name: z.string(),
     description: z.string().optional(),
     parameters: z.record(z.string(), z.unknown()).optional(),
     strict: z.boolean().optional(),
     defer_loading: z.boolean().optional(),
});
export type FunctionTool = z.infer<typeof FunctionToolSchema>;

/** File search tool definition */
export const FileSearchToolSchema = z.object({
     type: z.literal("file_search"),
     vector_store_ids: z.array(z.string()),
     filters: FileSearchFilterSchema.optional(),
     max_num_results: z.number().optional(),
     ranking_options: RankingOptionsSchema.optional(),
});
export type FileSearchTool = z.infer<typeof FileSearchToolSchema>;

/** Computer tool definition */
export const ComputerToolSchema = z.object({
     type: z.literal("computer"),
});
export type ComputerTool = z.infer<typeof ComputerToolSchema>;

/** Computer use preview tool definition */
export const ComputerUsePreviewToolSchema = z.object({
     type: z.literal("computer_use_preview"),
     display_width: z.number(),
     display_height: z.number(),
     environment: ComputerEnvironmentSchema,
});
export type ComputerUsePreviewTool = z.infer<
     typeof ComputerUsePreviewToolSchema
>;

/** Web search tool definition */
export const WebSearchToolSchema = z.object({
     type: WebSearchTypeSchema,
     filters: WebSearchFiltersSchema.optional(),
     search_context_size: SearchContextSizeSchema.optional(),
     user_location: UserLocationSchema.optional(),
});
export type WebSearchTool = z.infer<typeof WebSearchToolSchema>;

/** Web search preview tool definition */
export const WebSearchPreviewToolSchema = z.object({
     type: WebSearchPreviewTypeSchema,
     search_content_types: z.array(z.enum(["text", "image"])).optional(),
     search_context_size: SearchContextSizeSchema.optional(),
     user_location: UserLocationSchema.optional(),
});
export type WebSearchPreviewTool = z.infer<typeof WebSearchPreviewToolSchema>;

/** MCP tool definition */
export const McpToolSchema = z.object({
     type: z.literal("mcp"),
     server_label: z.string(),
     server_url: z.string().optional(),
     connector_id: ConnectorIdSchema.optional(),
     allowed_tools: McpAllowedToolsSchema.optional(),
     authorization: z.string().optional(),
     headers: z.record(z.string(), z.string()).optional(),
     require_approval: z
          .union([McpToolApprovalFilterSchema, McpToolApprovalSettingSchema])
          .optional(),
     defer_loading: z.boolean().optional(),
     server_description: z.string().optional(),
});
export type McpTool = z.infer<typeof McpToolSchema>;

/** Code interpreter tool definition */
export const CodeInterpreterToolSchema = z.object({
     type: z.literal("code_interpreter"),
     container: CodeInterpreterContainerSchema.optional(),
});
export type CodeInterpreterTool = z.infer<typeof CodeInterpreterToolSchema>;

/** Image generation tool definition */
export const ImageGenerationToolSchema = z.object({
     type: z.literal("image_generation"),
     action: ImageActionSchema.optional(),
     background: ImageBackgroundSchema.optional(),
     input_fidelity: InputFidelitySchema.optional(),
     input_image_mask: ImageInputMaskSchema.optional(),
     model: z.union([z.string(), ImageGenerationModelSchema]).optional(),
     moderation: ModerationLevelSchema.optional(),
     output_compression: z.number().optional(),
     output_format: ImageFormatSchema.optional(),
     partial_images: z.number().optional(),
     quality: ImageQualitySchema.optional(),
     size: ImageSizeSchema.optional(),
});
export type ImageGenerationTool = z.infer<typeof ImageGenerationToolSchema>;

/** Custom tool definition */
export const CustomToolSchema = z.object({
     type: z.literal("custom"),
     name: z.string(),
     description: z.string().optional(),
     defer_loading: z.boolean().optional(),
     format: z.unknown().optional(),
});
export type CustomTool = z.infer<typeof CustomToolSchema>;

/** Apply patch tool definition */
export const ApplyPatchToolSchema = z.object({
     type: z.literal("apply_patch"),
});
export type ApplyPatchTool = z.infer<typeof ApplyPatchToolSchema>;

/** Shell tool definition */
export const ShellToolSchema = z.object({
     type: z.literal("shell"),
     environment: z.unknown().optional(),
});
export type ShellTool = z.infer<typeof ShellToolSchema>;

/** Local shell tool definition */
export const LocalShellToolSchema = z.object({
     type: z.literal("local_shell"),
});
export type LocalShellTool = z.infer<typeof LocalShellToolSchema>;

/** Tool definition union */
export const ToolDefinitionSchema = z.discriminatedUnion("type", [
     FunctionToolSchema,
     FileSearchToolSchema,
     ComputerToolSchema,
     ComputerUsePreviewToolSchema,
     WebSearchToolSchema,
     WebSearchPreviewToolSchema,
     McpToolSchema,
     CodeInterpreterToolSchema,
     ImageGenerationToolSchema,
     CustomToolSchema,
     ApplyPatchToolSchema,
     ShellToolSchema,
     LocalShellToolSchema,
]);
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

// ─────────────────────────────────────────────────────────────
// Tool Choice
// ─────────────────────────────────────────────────────────────

/** Tool choice options (none, auto, required) */
export const ToolChoiceOptionsSchema = z.enum(["none", "auto", "required"]);
export type ToolChoiceOptions = z.infer<typeof ToolChoiceOptionsSchema>;

/** Tool choice allowed */
export const ToolChoiceAllowedSchema = z.object({
     type: z.literal("allowed_tools"),
     mode: z.enum(["auto", "required"]),
     tools: z.array(z.record(z.string(), z.unknown())),
});
export type ToolChoiceAllowed = z.infer<typeof ToolChoiceAllowedSchema>;

/** Tool choice function */
export const ToolChoiceFunctionSchema = z.object({
     type: z.literal("function"),
     name: z.string(),
});
export type ToolChoiceFunction = z.infer<typeof ToolChoiceFunctionSchema>;

/** Tool choice MCP */
export const ToolChoiceMcpSchema = z.object({
     type: z.literal("mcp"),
     server_label: z.string(),
     name: z.string().optional(),
});
export type ToolChoiceMcp = z.infer<typeof ToolChoiceMcpSchema>;

/** Tool choice custom */
export const ToolChoiceCustomSchema = z.object({
     type: z.literal("custom"),
     name: z.string(),
});
export type ToolChoiceCustom = z.infer<typeof ToolChoiceCustomSchema>;

/** Tool choice apply patch */
export const ToolChoiceApplyPatchSchema = z.object({
     type: z.literal("apply_patch"),
});
export type ToolChoiceApplyPatch = z.infer<typeof ToolChoiceApplyPatchSchema>;

/** Tool choice shell */
export const ToolChoiceShellSchema = z.object({
     type: z.literal("shell"),
});
export type ToolChoiceShell = z.infer<typeof ToolChoiceShellSchema>;

/** Tool choice types (built-in tools) */
export const ToolChoiceTypesSchema = z.object({
     type: ToolChoiceTypeSchema,
});
export type ToolChoiceTypes = z.infer<typeof ToolChoiceTypesSchema>;

/** Tool choice union */
export const ToolChoiceSchema = z.union([
     ToolChoiceOptionsSchema,
     ToolChoiceAllowedSchema,
     ToolChoiceTypesSchema,
     ToolChoiceFunctionSchema,
     ToolChoiceMcpSchema,
     ToolChoiceCustomSchema,
     ToolChoiceApplyPatchSchema,
     ToolChoiceShellSchema,
]);
export type ToolChoice = z.infer<typeof ToolChoiceSchema>;

// ─────────────────────────────────────────────────────────────
// Text Config
// ─────────────────────────────────────────────────────────────

/** Response format text */
export const ResponseFormatTextSchema = z.object({
     type: z.literal("text"),
});
export type ResponseFormatText = z.infer<typeof ResponseFormatTextSchema>;

/** Response format JSON schema */
export const ResponseFormatTextJSONSchemaConfigSchema = z.object({
     type: z.literal("json_schema"),
     name: z.string(),
     schema: z.record(z.string(), z.unknown()),
     description: z.string().optional(),
     strict: z.boolean().optional(),
});
export type ResponseFormatTextJSONSchemaConfig = z.infer<
     typeof ResponseFormatTextJSONSchemaConfigSchema
>;

/** Response format JSON object */
export const ResponseFormatJSONObjectSchema = z.object({
     type: z.literal("json_object"),
});
export type ResponseFormatJSONObject = z.infer<
     typeof ResponseFormatJSONObjectSchema
>;

/** Text format config union */
export const ResponseFormatTextConfigSchema = z.discriminatedUnion("type", [
     ResponseFormatTextSchema,
     ResponseFormatTextJSONSchemaConfigSchema,
     ResponseFormatJSONObjectSchema,
]);
export type ResponseFormatTextConfig = z.infer<
     typeof ResponseFormatTextConfigSchema
>;

/** Text config */
export const ResponseTextConfigSchema = z.object({
     format: ResponseFormatTextConfigSchema.optional(),
     verbosity: VerbositySchema.optional(),
});
export type ResponseTextConfig = z.infer<typeof ResponseTextConfigSchema>;

// ─────────────────────────────────────────────────────────────
// Reasoning Config
// ─────────────────────────────────────────────────────────────

/** Reasoning config */
export const ReasoningConfigSchema = z.object({
     effort: ReasoningEffortSchema.optional(),
     generate_summary: SummaryTypeSchema.optional(),
     summary: SummaryTypeSchema.optional(),
});
export type ReasoningConfig = z.infer<typeof ReasoningConfigSchema>;

// ─────────────────────────────────────────────────────────────
// Context Management
// ─────────────────────────────────────────────────────────────

/** Context management entry */
export const ContextManagementEntrySchema = z.object({
     type: z.string(),
     compact_threshold: z.number().optional(),
});
export type ContextManagementEntry = z.infer<
     typeof ContextManagementEntrySchema
>;

// ─────────────────────────────────────────────────────────────
// Conversation
// ─────────────────────────────────────────────────────────────

/** Response conversation param */
export const ResponseConversationParamSchema = z.object({
     id: z.string(),
});
export type ResponseConversationParam = z.infer<
     typeof ResponseConversationParamSchema
>;

/** Conversation reference */
export const ConversationReferenceSchema = z.union([
     z.string(),
     ResponseConversationParamSchema,
]);
export type ConversationReference = z.infer<typeof ConversationReferenceSchema>;

// ─────────────────────────────────────────────────────────────
// Prompt
// ─────────────────────────────────────────────────────────────

/** Response prompt variable value */
export const ResponsePromptVariableValueSchema = z.union([
     z.string(),
     ResponseInputTextSchema,
     ResponseInputImageSchema,
     ResponseInputFileSchema,
]);
export type ResponsePromptVariableValue = z.infer<
     typeof ResponsePromptVariableValueSchema
>;

/** Response prompt */
export const ResponsePromptSchema = z.object({
     id: z.string(),
     variables: z
          .record(z.string(), ResponsePromptVariableValueSchema)
          .optional(),
     version: z.string().optional(),
});
export type ResponsePrompt = z.infer<typeof ResponsePromptSchema>;

// ─────────────────────────────────────────────────────────────
// Stream Options
// ─────────────────────────────────────────────────────────────

/** Stream options */
export const StreamOptionsSchema = z.object({
     include_obfuscation: z.boolean().optional(),
});
export type StreamOptions = z.infer<typeof StreamOptionsSchema>;

// ─────────────────────────────────────────────────────────────
// Response Objects
// ─────────────────────────────────────────────────────────────

/** Response error */
export const ResponseErrorSchema = z.object({
     code: ResponseErrorCodeSchema,
     message: z.string(),
});
export type ResponseError = z.infer<typeof ResponseErrorSchema>;

/** Incomplete details */
export const IncompleteDetailsSchema = z.object({
     reason: IncompleteDetailsReasonSchema,
});
export type IncompleteDetails = z.infer<typeof IncompleteDetailsSchema>;

/** Usage details */
export const InputTokensDetailsSchema = z.object({
     cached_tokens: z.number(),
});
export type InputTokensDetails = z.infer<typeof InputTokensDetailsSchema>;

/** Output tokens details */
export const OutputTokensDetailsSchema = z.object({
     reasoning_tokens: z.number(),
});
export type OutputTokensDetails = z.infer<typeof OutputTokensDetailsSchema>;

/** Usage */
export const ResponseUsageSchema = z.object({
     input_tokens: z.number(),
     output_tokens: z.number(),
     total_tokens: z.number(),
     input_tokens_details: InputTokensDetailsSchema,
     output_tokens_details: OutputTokensDetailsSchema,
});
export type ResponseUsage = z.infer<typeof ResponseUsageSchema>;

/** Conversation */
export const ConversationSchema = z.object({
     id: z.string(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

// ─────────────────────────────────────────────────────────────
// Complete Output Item Union
// ─────────────────────────────────────────────────────────────

/** All possible output items */
export const ResponseOutputItemSchema = z.discriminatedUnion("type", [
     ResponseOutputMessageSchema,
     FileSearchCallSchema,
     WebSearchCallSchema,
     FunctionCallSchema,
     FunctionCallOutputSchema,
     ComputerCallSchema,
     ComputerCallOutputSchema,
     ReasoningSchema,
     ImageGenerationCallSchema,
     CodeInterpreterCallSchema,
     CustomToolCallSchema,
     CustomToolCallOutputSchema,
     ShellCallSchema,
     ShellCallOutputSchema,
     ApplyPatchCallSchema,
     ApplyPatchCallOutputSchema,
     McpCallSchema,
     McpListToolsSchema,
     McpApprovalRequestSchema,
     McpApprovalResponseSchema,
]);
export type ResponseOutputItem = z.infer<typeof ResponseOutputItemSchema>;

// ─────────────────────────────────────────────────────────────
// Complete Request
// ─────────────────────────────────────────────────────────────

/** Responses API request */
export const CreateResponseRequestSchema = z.object({
     model: z.string(),
     background: z.boolean().optional(),
     context_management: z.array(ContextManagementEntrySchema).optional(),
     conversation: ConversationReferenceSchema.optional(),
     include: z.array(ResponseIncludableSchema).optional(),
     input: InputSchema,
     instructions: z.string().optional(),
     max_output_tokens: z.number().optional(),
     max_tool_calls: z.number().optional(),
     metadata: MetadataSchema.optional(),
     parallel_tool_calls: z.boolean().optional(),
     previous_response_id: z.string().optional(),
     prompt: ResponsePromptSchema.optional(),
     prompt_cache_key: z.string().optional(),
     prompt_cache_retention: PromptCacheRetentionSchema.optional(),
     reasoning: ReasoningConfigSchema.optional(),
     safety_identifier: z.string().optional(),
     service_tier: ServiceTierSchema.optional(),
     store: z.boolean().optional(),
     stream: z.boolean().optional(),
     stream_options: StreamOptionsSchema.optional(),
     temperature: z.number().optional(),
     text: ResponseTextConfigSchema.optional(),
     tool_choice: ToolChoiceSchema.optional(),
     tools: z.array(ToolDefinitionSchema).optional(),
     top_logprobs: z.number().optional(),
     top_p: z.number().optional(),
     truncation: TruncationSchema.optional(),
     user: z.string().optional(),
});
export type CreateResponseRequest = z.infer<typeof CreateResponseRequestSchema>;

// ─────────────────────────────────────────────────────────────
// Complete Response
// ─────────────────────────────────────────────────────────────

/** Responses API response */
export const ResponseSchema = z.object({
     id: z.string(),
     object: z.literal("response"),
     created_at: z.number(),
     completed_at: z.number().optional(),
     status: ResponseStatusSchema.optional(),
     error: ResponseErrorSchema.optional(),
     incomplete_details: IncompleteDetailsSchema.optional(),
     instructions: z.union([z.string(), z.array(InputItemSchema)]).optional(),
     metadata: MetadataSchema,
     model: z.string(),
     output: z.array(ResponseOutputItemSchema),
     parallel_tool_calls: z.boolean(),
     temperature: z.number(),
     tool_choice: ToolChoiceSchema,
     tools: z.array(ToolDefinitionSchema),
     top_p: z.number(),
     background: z.boolean().optional(),
     conversation: ConversationSchema.optional(),
     max_output_tokens: z.number().optional(),
     max_tool_calls: z.number().optional(),
     output_text: z.string().optional(),
     previous_response_id: z.string().optional(),
     prompt: ResponsePromptSchema.optional(),
     prompt_cache_key: z.string().optional(),
     prompt_cache_retention: PromptCacheRetentionSchema.optional(),
     reasoning: ReasoningConfigSchema.optional(),
     safety_identifier: z.string().optional(),
     service_tier: ServiceTierSchema.optional(),
     text: ResponseTextConfigSchema.optional(),
     top_logprobs: z.number().optional(),
     truncation: TruncationSchema.optional(),
     usage: ResponseUsageSchema.optional(),
     user: z.string().optional(),
});
export type Response = z.infer<typeof ResponseSchema>;

// ─────────────────────────────────────────────────────────────
// Model Types (for reference)
// ─────────────────────────────────────────────────────────────

/** List of supported models */
export const ResponsesModelSchema = z.string();
export type ResponsesModel = z.infer<typeof ResponsesModelSchema>;
