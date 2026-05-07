import type { Request, Response } from "express";
import {
  ResponsesRequestSchema,
  validateResponsesRequest,
  validateResponsesRequestSafe,
  ResponsesRequest,
  ErrorResponse,
  ResponsesResponse,
} from "./responses.schemas.js";
import {
  ResponsesService,
  createResponsesService,
  type ChatFunction,
  type StreamEvent,
} from "./responses.service.js";

/**
 * Express controller for /v1/responses endpoint
 */
export class ResponsesController {
  private service: ResponsesService;

  /**
   * Create a new ResponsesController
   * @param chatFunction - The function to call Ollama's chat API
   */
  constructor(chatFunction: ChatFunction) {
    this.service = createResponsesService(chatFunction);
  }

  /**
   * Handle POST /v1/responses
   * Create a response from the model
   */
  async handleResponse(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      const validationResult = validateResponsesRequestSafe(req.body);

      if (!validationResult.success) {
        res.status(400).json(this.formatZodError(validationResult.error));
        return;
      }

      const request = validationResult.data;

      // Check if streaming
      if (request.stream) {
        await this.handleStreamRequest(req, res, request);
        return;
      }

      // Process non-streaming request
      const response = await this.service.processRequest(request);

      // Send response
      res.status(200).json(response);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Handle streaming request
   */
  private async handleStreamRequest(
    req: Request,
    res: Response,
    request: ResponsesRequest
  ): Promise<void> {
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    try {
      // Get streaming events from service
      const stream = this.service.processStreamRequest(request);

      // Send each event as SSE
      for await (const event of stream) {
        const sseData = this.formatSSEEvent(event);
        res.write(sseData);
      }

      // Send final DONE message
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      // Send error as SSE
      const errorEvent = this.formatErrorEvent(error);
      res.write(errorEvent);
      res.end();
    }
  }

  /**
   * Handle GET /v1/responses/:id
   * Retrieve a specific response (not implemented in Ollama)
   */
  async handleGetResponse(req: Request, res: Response): Promise<void> {
    res.status(501).json({
      error: {
        message: "Retrieving previous responses is not supported",
        type: "invalid_request_error",
        code: "not_implemented",
      },
    });
  }

  /**
   * Handle DELETE /v1/responses/:id
   * Cancel an in-progress response (not implemented)
   */
  async handleCancelResponse(req: Request, res: Response): Promise<void> {
    res.status(501).json({
      error: {
        message: "Response cancellation is not supported",
        type: "invalid_request_error",
        code: "not_implemented",
      },
    });
  }

  /**
   * Format Zod validation error for API response
   */
  private formatZodError(error: { issues: Array<{ message: string; path: (string | number)[] }> }): ErrorResponse {
    const messages = error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`
    );

    return {
      error: {
        message: `Validation error: ${messages.join(", ")}`,
        type: "invalid_request_error",
        code: "validation_error",
      },
    };
  }

  /**
   * Format error for response
   */
  private handleError(res: Response, error: unknown): void {
    console.error("Responses API error:", error);

    if (error instanceof Error) {
      // Check for specific error types
      if (error.message.includes("not supported")) {
        res.status(400).json({
          error: {
            message: error.message,
            type: "invalid_request_error",
            code: "not_supported",
          },
        });
        return;
      }

      if (error.message.includes("model")) {
        res.status(404).json({
          error: {
            message: error.message,
            type: "invalid_request_error",
            code: "model_not_found",
          },
        });
        return;
      }

      // Generic server error
      res.status(500).json({
        error: {
          message: error.message,
          type: "server_error",
          code: "internal_error",
        },
      });
      return;
    }

    // Unknown error
    res.status(500).json({
      error: {
        message: "An unexpected error occurred",
        type: "server_error",
        code: "internal_error",
      },
    });
  }

  /**
   * Format a stream event as SSE
   */
  private formatSSEEvent(event: StreamEvent): string {
    return `data: ${JSON.stringify(event)}\n\n`;
  }

  /**
   * Format an error as SSE
   */
  private formatErrorEvent(error: unknown): string {
    let message = "An unexpected error occurred";
    if (error instanceof Error) {
      message = error.message;
    }

    const event = {
      type: "response.error",
      data: {
        error: {
          message,
          type: "server_error",
          code: "internal_error",
        },
      },
    };

    return `data: ${JSON.stringify(event)}\n\n`;
  }
}

/**
 * Create a ResponsesController with the provided chat function
 * This is the main factory function to use
 */
export function createResponsesController(chatFunction: ChatFunction): ResponsesController {
  return new ResponsesController(chatFunction);
}

// ============================================================================
// Express Router Setup
// ============================================================================

import { Router } from "express";

/**
 * Create and configure the responses router
 * @param chatFunction - The function to call Ollama's chat API (Promise<Response>)
 * @returns Configured Express router
 */
export function createResponsesRouter(chatFunction: ChatFunction): Router {
  const controller = createResponsesController(chatFunction);
  const router = Router();

  // POST /v1/responses - Create a response
  router.post("/", (req: Request, res: Response) => controller.handleResponse(req, res));

  // GET /v1/responses/:id - Get a response (not implemented)
  router.get("/:id", (req: Request, res: Response) => controller.handleGetResponse(req, res));

  // DELETE /v1/responses/:id - Cancel a response (not implemented)
  router.delete("/:id", (req: Request, res: Response) => controller.handleCancelResponse(req, res));

  return router;
}

// ============================================================================
// Usage Example
// ============================================================================

/**
 * Example usage in an Express app:
 *
 * ```typescript
 * import express from 'express';
 * import { createResponsesRouter } from './responses.controller.js';
 *
 * // Your chat function that calls Ollama
 * const chatFunction = async (request) => {
 *   const response = await fetch('http://localhost:11434/api/chat', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify(request),
 *   });
 *   return response;
 * };
 *
 * const app = express();
 * app.use(express.json());
 *
 * // Mount the responses router at /v1
 * app.use('/v1/responses', createResponsesRouter(chatFunction));
 *
 * app.listen(3000, () => {
 *   console.log('Server running on port 3000');
 * });
 * ```
 */

// ============================================================================
// Type Exports for External Use
// ============================================================================

export type { ChatFunction } from "./responses.service.js";
export type { ResponsesRequest, ResponsesResponse } from "./responses.schemas.js";
