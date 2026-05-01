import type { z } from 'zod'

// ─── Errors ───────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
    message?: string
  ) {
    super(message ?? `API request failed: ${status} ${statusText}`)
    this.name = 'ApiError'
  }
}

// ─── Core helper ─────────────────────────────────────────────────────────────

/**
 * Validates `body` against `requestSchema`, POSTs to `url`, then validates
 * the response JSON against `responseSchema`.
 *
 * @example
 * const { data } = await postValidated(
 *   "/api/chat",
 *   ChatRequestSchema,
 *   ChatResponseSchema,
 *   { message: "Hello" },
 * );
 * // `data` is fully typed as z.infer<typeof ChatResponseSchema>
 */
export async function postValidated<
  TIn extends z.ZodType,
  TOut extends z.ZodType
>(
  url: string,
  requestSchema: TIn,
  responseSchema: TOut,
  body: z.input<TIn>, // typed as pre-parse input shape
  init?: Omit<RequestInit, 'method' | 'body'> // optional fetch overrides
): Promise<{ data: z.output<TOut>; response: Response }> {
  // 1. Validate request (throws ZodError on failure)
  const validatedBody: z.output<TIn> = requestSchema.parse(body)

  // 2. Fetch
  const response = await fetch(url, {
    ...init,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers // caller headers win
    },
    body: JSON.stringify(validatedBody)
  })

  // 3. Parse response body once (avoids consuming the stream twice)
  const json: unknown = await response.json().catch(() => ({}))

  // 4. HTTP-level error — include parsed body for richer debugging
  if (!response.ok) {
    const message =
      typeof json === 'object' && json !== null && 'message' in json
        ? String((json as { message: unknown }).message)
        : `API request failed: ${response.status} ${response.statusText}`

    throw new ApiError(response.status, response.statusText, json, message)
  }

  // 5. Validate response (throws ZodError on mismatch)
  const data: z.output<TOut> = responseSchema.parse(json)

  return { data, response }
}
