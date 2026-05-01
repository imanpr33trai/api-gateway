import type { z } from "zod";

import { ApiError, StreamError } from "../types/error.type";

interface StreamResponse<T> {
     /** Validated + parsed request body that was sent */
     sentBody: T;
     /** Raw fetch Response (headers, status, etc.) */
     response: Response;
     /** Raw byte stream — pipe through a reader or TransformStream */
     stream: ReadableStream<Uint8Array>;
}

/**
 * Validates body with Zod and sends a POST request.
 * TSchema: The Zod schema for the request body.
 * TResponse: The expected TypeScript interface for the response.
 */
export async function postStreaming<TSchema extends z.ZodTypeAny>(
     url: string,
     requestSchema: TSchema,
     body: z.input<TSchema>, // accepts the *pre-parse* shape
     init?: Omit<RequestInit, "method" | "body">, // optional fetch overrides
): Promise<StreamResponse<z.output<TSchema>>> {
     // 1. Validate & transform (throws ZodError on failure)
     const validatedBody: z.output<TSchema> = requestSchema.parse(body);

     // 2. Fetch
     const response = await fetch(url, {
          ...init,
          method: "POST",
          headers: {
               "Content-Type": "application/json",
               ...init?.headers, // caller headers win
          },
          body: JSON.stringify(validatedBody),
     });

     // 3. HTTP-level error
     if (!response.ok) {
          throw new ApiError(response.status, response.statusText);
     }

     // 4. Guard against missing body (e.g. 204 No Content)
     if (!response.body) {
          throw new StreamError(
               `No readable stream on response from ${url} (status ${response.status})`,
          );
     }

     return { sentBody: validatedBody, response, stream: response.body };
}
