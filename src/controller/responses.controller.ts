// src/controller/responses.controller.ts
import type { Context } from "hono";
import { z } from "zod";
import {
     responseCompletion,
     responseCompletionStream,
} from "../services/response.service";
import { ValidationError } from "../types/error.type";
import { ResponsesRequestSchema } from "../types/responses";
import { handleAsync } from "../utils/errorHandler";

export const responsesController = async (c: Context) => {
     try {
          const body = await c.req.json();

          // Debug: Log the incoming request
          console.log("Incoming request body:", JSON.stringify(body, null, 2));

          const parsed = ResponsesRequestSchema.safeParse(body);

          if (!parsed.success) {
               console.error(
                    "Validation errors:",
                    JSON.stringify(parsed.error.issues, null, 2),
               );
               throw new ValidationError("Invalid request body", {
                    issues: parsed.error.issues,
               });
          }

          // Streaming
          if (parsed.data.stream) {
               const providerResponse = await responseCompletionStream({
                    ...parsed.data,
                    stream: true,
               });

               if (!providerResponse) {
                    return c.text(
                         "Upstream provider did not return a stream",
                         500,
                    );
               }

               const reader = providerResponse.getReader();
               const abortController = new AbortController();

               c.req.raw.signal.addEventListener("abort", () => {
                    abortController.abort();
                    reader.cancel().catch(() => {});
               });

               const stream = new ReadableStream({
                    async pull(controller) {
                         try {
                              const { done, value } = await reader.read();
                              if (done) {
                                   controller.close();
                                   return;
                              }
                              controller.enqueue(value);
                         } catch (error) {
                              if (abortController.signal.aborted) {
                                   controller.close();
                              } else {
                                   controller.error(error);
                              }
                         }
                    },
                    cancel() {
                         reader.cancel().catch(() => {});
                         abortController.abort();
                    },
               });

               // Responses API streaming uses standard SSE with event types
               const contentType =
                    c.req.header("content-type") ?? "text/event-stream";

               return new Response(stream, {
                    status: 200,
                    headers: {
                         "Content-Type": contentType,
                         "Cache-Control": "no-cache",
                         "X-Content-Type-Options": "nosniff",
                    },
               });
          }

          // Non‑streaming
          const [result, error] = await handleAsync(
               responseCompletion(parsed.data),
          );
          if (error) throw error;
          return c.json(result);
     } catch (err) {
          if (err instanceof z.ZodError) {
               const formattedIssues = err.issues.map((issue) => ({
                    path: issue.path.join("."),
                    message: issue.message,
               }));
               throw new ValidationError("Invalid request body", {
                    issues: formattedIssues,
                    count: err.issues.length,
               });
          }
          throw err;
     }
};
