import type { Context } from "hono";
import z from "zod";
import { ChatCompletionRequestSchema } from "../providers/types";
import { chatCompletionStream } from "../services/chat.service";
import { ValidationError } from "../types/error.type";

export const chatStreamController = async (c: Context) => {
     try {
          const body = await c.req.json();
          const parsed = ChatCompletionRequestSchema.parse(body);

          const providerResponse = await chatCompletionStream({
               ...parsed,
               stream: true,
          });

          if (!providerResponse.body) {
               return c.text("Upstream provider did not return a stream", 500);
          }
          const reader = providerResponse.body.getReader();

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

          const contentType =
               providerResponse.headers.get("content-type") ??
               "text/event-stream";

          return new Response(stream, {
               status: 200,
               headers: {
                    "Content-Type": contentType,
                    "Cache-Control": "no-cache",
                    "X-Content-Type-Options": "nosniff",
               },
          });
     } catch (err) {
          if (err instanceof z.ZodError) {
               throw new ValidationError("Invalid request body", {
                    issues: err.issues,
               });
          }
          throw err;
     }
};
