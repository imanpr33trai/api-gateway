import type { BodyInit, HeadersInit } from 'bun'
import z from 'zod'

type Fetch = typeof globalThis.fetch

interface RequestOptions {
  headers?: HeadersInit
  signal?: AbortSignal
}

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

const isPlainObject = (input: unknown): input is Record<string, unknown> =>
  input !== null && typeof input === 'object' && !Array.isArray(input)

const checkOk = async (response: Response): Promise<void> => {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const message =
      isPlainObject(body) && typeof body.message === 'string'
        ? body.message
        : `API request failed: ${response.status} ${response.statusText}`
    throw new ApiError(response.status, response.statusText, body, message)
  }
}

export const get = async <TOut extends z.ZodType>(
  fetch: Fetch,
  host: string,
  responseSchema: TOut,
  options?: RequestOptions
): Promise<z.output<TOut>> => {
  const response = await fetchWithHeaders(fetch, host, {
    headers: options?.headers
  })
  await checkOk(response)
  const json: unknown = await response.json()
  return responseSchema.parse(json)
}
export const head = async (
  fetch: Fetch,
  host: string,
  options?: Pick<RequestOptions, 'headers'>
): Promise<Headers> => {
  const response = await fetchWithHeaders(fetch, host, {
    method: 'HEAD',
    headers: options?.headers
  })
  await checkOk(response)
  return response.headers // HEAD responses have no body — return headers directly
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export const post = async <TIn extends z.ZodType, TOut extends z.ZodType>(
  fetch: Fetch,
  host: string,
  requestSchema: TIn,
  responseSchema: TOut,
  data: z.input<TIn>,
  options?: RequestOptions
): Promise<z.output<TOut>> => {
  const validatedBody: z.output<TIn> = requestSchema.parse(data)
  const body = isPlainObject(validatedBody)
    ? JSON.stringify(validatedBody)
    : (validatedBody as BodyInit)

  const response = await fetchWithHeaders(fetch, host, {
    method: 'POST',
    body,
    signal: options?.signal,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  })

  await checkOk(response)
  const json: unknown = await response.json()
  return responseSchema.parse(json)
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export const del = async <TIn extends z.ZodType, TOut extends z.ZodType>(
  fetch: Fetch,
  host: string,
  requestSchema: TIn,
  responseSchema: TOut,
  data?: z.input<TIn>,
  options?: RequestOptions
): Promise<z.output<TOut>> => {
  const validatedBody =
    data !== undefined ? requestSchema.parse(data) : undefined

  const response = await fetchWithHeaders(fetch, host, {
    method: 'DELETE',
    body:
      validatedBody !== undefined ? JSON.stringify(validatedBody) : undefined,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  })

  await checkOk(response)
  const json: unknown = await response.json()
  return responseSchema.parse(json)
}

// ─── parseJSON ────────────────────────────────────────────────────────────────

export const parseJSON = async function* <TOut extends z.ZodType>(
  itr: ReadableStream<Uint8Array>,
  schema: TOut
): AsyncGenerator<z.output<TOut>> {
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  const reader = itr.getReader()

  const yieldParsed = function* (line: string): Generator<z.output<TOut>> {
    if (!line.trim()) return
    try {
      const json: unknown = JSON.parse(line)
      yield schema.parse(json) // throws ZodError on mismatch
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.warn('[parseJSON] Schema mismatch:', error.issues)
      } else {
        console.warn('[parseJSON] Invalid JSON:', line)
      }
    }
  }

  try {
    while (true) {
      const { done, value: chunk } = await reader.read()
      if (done) break

      buffer += decoder.decode(chunk, { stream: true })
      const parts = buffer.split('\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        yield* yieldParsed(part)
      }
    }

    // flush remaining decoder bytes
    buffer += decoder.decode()
    for (const part of buffer.split('\n')) {
      yield* yieldParsed(part)
    }
  } finally {
    reader.releaseLock() // always release, even on error
  }
}
