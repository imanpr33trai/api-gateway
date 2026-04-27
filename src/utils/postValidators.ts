import type z from "zod";

/**
 * TSchema: The Zod schema for the request body.
 * TResponseData: The expected TypeScript interface for the response body.
 */
interface ValidatedFetchResponse<TOut> {
   data: TOut;
   response: Response;
}

/**
 * Validates body with Zod and sends a POST request.
 * TSchema: The Zod schema for the request body.
 * TResponse: The expected TypeScript interface for the response.
 */
export async function postValidated<
   TIn extends z.ZodType,
   TOut extends z.ZodType,
>(
   url: string,
   requestSchema: TIn,
   responseSchema: TOut,

   body: unknown,
): Promise<{ data: z.infer<TOut>; response: Response }> {
   const validatedBody = requestSchema.parse(body);

   const response = await fetch(url, {
      method: "POST",
      headers: {
         "Content-Type": "application/json",
         Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      },
      body: JSON.stringify(validatedBody),
   });

   if (!response.ok) {
      const errorBody = (await response.json().catch(() => ({}))) as {
         message?: string;
      };
      throw new Error(errorBody.message || `Error ${response.status}`);
   }

   // const data = (await response.json()) as Promise<TResponseData>;

   const json = await response.json();
   const validatedResponse = responseSchema.parse(json);
   return { data: validatedResponse, response };
}
