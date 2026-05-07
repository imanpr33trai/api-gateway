import { type Request, type Response } from "express";
import {
  ChatCompletionRequestSchema,
  validateChatCompletionRequestSafe,
  ChatCompletionResponseSchema,
  type ChatCompletionRequest,
  type ChatCompletionResponse,
} from "./chat-completions.schemas.js";
import { ChatCompletionsService } from "./chat-completions.service.js";
import type { ChatFunction } from "../responses/responses.service.js";

/**
 * Chat Completions Controller
 */
export class ChatCompletionsController {
  private service: ChatCompletionsService;

  constructor(chatFunction: ChatFunction) {
    this.service = new ChatCompletionsService(chatFunction);
  }

  /**
   * Handle POST /v1/chat/completions
   */
  async handleCompletion(req: Request, res: Response): Promise<void> {
    try {
      const validation = validateChatCompletionRequestSafe(req.body);

      if (!validation.success) {
        res.status(400).json({
          error: {
            message: `Validation error: ${validation.error.issues.map((i) => i.message).join(", ")}`,
            type: "invalid_request_error",
            code: "validation_error",
          },
        });
        return;
      }

      const request = validation.data;

      if (request.stream) {
        await this.handleStreamRequest(req, res, request);
        return;
      }

      const response = await this.service.processRequest(request);
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
    request: ChatCompletionRequest
  ): Promise<void> {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      const stream = this.service.processStreamRequest(request);

      for await (const chunk of stream) {
        const data = `data: ${JSON.stringify(chunk)}\n\n`;
        res.write(data);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      const errorData = this.formatErrorEvent(error);
      res.write(errorData);
      res.end();
    }
  }

  /**
   * Handle error
   */
  private handleError(res: Response, error: unknown): void {
    console.error("Chat Completions error:", error);

    if (error instanceof Error) {
      res.status(500).json({
        error: {
          message: error.message,
          type: "server_error",
          code: "internal_error",
        },
      });
      return;
    }

    res.status(500).json({
      error: {
        message: "Internal error",
        type: "server_error",
        code: "internal_error",
      },
    });
  }

  /**
   * Format error as SSE
   */
  private formatErrorEvent(error: unknown): string {
    let message = "Unknown error";
    if (error instanceof Error) {
      message = error.message;
    }

    return `data: ${JSON.stringify({ error: { message, type: "server_error" } })}\n\n`;
  }
}

/**
 * Create a ChatCompletionsController
 */
export function createChatCompletionsController(chatFunction: ChatFunction): ChatCompletionsController {
  return new ChatCompletionsController(chatFunction);
}

/**
 * Create the router
 */
import { Router } from "express";

export function createChatCompletionsRouter(chatFunction: ChatFunction) {
  const controller = createChatCompletionsController(chatFunction);
  const router = Router();

  router.post("/", (req: Request, res: Response) => controller.handleCompletion(req, res));

  return router;
}

// Re-export types
export type { ChatFunction } from "../responses/responses.service.js";
