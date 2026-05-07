/**
 * Responses API Route Module
 * 
 * This module exports all components needed to implement the /v1/responses endpoint.
 * 
 * @packageDocumentation
 */

// Re-export schemas
export {
  ResponsesRequestSchema,
  ResponsesResponseSchema,
  validateResponsesRequest,
  validateResponsesRequestSafe,
  type ResponsesRequest,
  type ResponsesResponse,
  type ResponsesContent,
  type ResponsesInput,
  type ResponsesInputItem,
  type ResponsesTool,
  type ResponsesUsage,
  type ResponsesOutputItem,
  type ResponsesStreamEvent,
  type ErrorResponse,
} from "./responses.schemas.js";

// Re-export service
export {
  ResponsesService,
  createResponsesService,
  type ChatFunction,
  type StreamEvent,
  type OllamaChatRequest,
  type OllamaChatResponse,
  type OllamaMessage,
  type OllamaOptions,
  type OllamaTool,
  type OllamaToolCall,
} from "./responses.service.js";

// Re-export controller
export {
  ResponsesController,
  createResponsesController,
  createResponsesRouter,
} from "./responses.controller.js";
