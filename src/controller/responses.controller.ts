import type { Context } from "hono";
import { CodexRequestSchema, responseCompletionStream } from "../services/response.service";

export const responsesController = async (c: Context) => {
     const body = await c.req.json();
     const parsed = CodexRequestSchema.safeParse(body);

     if (!parsed.success) {
          return c.json(
               {
                    error: {
                         message: "Invalid request body",
                         type: "invalid_request_error",
                         param: null,
                         code: "invalid_body",
                         details: parsed.error.errors,
                    },
               },
               400,
          );
     }

     const req = parsed.data;

     try {
          const response = await responseCompletionStream(req);

          if (!response.ok) {
               const errorBody = await response.text().catch(() => "");
               return c.json(
                    {
                         error: {
                              message: `Provider error: ${response.status} - ${errorBody}`,
                              type: "provider_error",
                              code: "provider_error",
                         },
                    },
                    response.status,
               );
          }

          // Stream the response back to client
          return c.body(response.body, 200, {
               "Content-Type": "text/event-stream",
               "Cache-Control": "no-cache",
               Connection: "keep-alive",
          });
     } catch (error) {
          return c.json(
               {
                    error: {
                         message: error instanceof Error ? error.message : "Internal server error",
                         type: "internal_error",
                         code: "internal_error",
                    },
               },
               500,
          );
     }
};