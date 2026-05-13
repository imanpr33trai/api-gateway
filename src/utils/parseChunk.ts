import { StreamChunkSchema, type ParsedChunk } from '../types/types'

export const parseSSEChunk = (raw: string): ParsedChunk | null => {
  const line = raw.trim()

  if (!line || line.startsWith(':')) return null

  const payload = line.slice('data: '.length).trim()

  if (payload === '[DONE]') {
    return {
      id: '',
      content: '',
      isDone: true,
      model: ''
    }
  }

  try {
    const json: unknown = JSON.parse(payload)

    const chunk = StreamChunkSchema.parse(json)

    const firstChoice = chunk.choices[0]
    const isDone = firstChoice?.finish_reason != null
    const content = firstChoice?.delta.content ?? ''

    return {
      id: chunk.id,
      model: chunk.model,
      content,
      isDone,
      finish_reason: firstChoice?.finish_reason ?? null,
      role: firstChoice?.delta.role
    }
  } catch (error) {
    return null // malformed chunk — skip, don't crash the stream
  }
}

const decoder = new TextDecoder()

export const parseSSEStream = (
  raw: ReadableStream
): AsyncGenerator<ParsedChunk> => {
  const reader = raw
    .pipeThrough(
      new TransformStream<Uint8Array, string>({
        transform(chunk, controller) {
          controller.enqueue(decoder.decode(chunk, { stream: true }))
        },
        flush(controller) {
          const remaining = decoder.decode()
          if (remaining) controller.enqueue(remaining)
        }
      })
    )
    .pipeThrough(splitLines())
    .getReader()

  return (async function* () {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = parseSSEChunk(value)
        if (chunk) yield chunk
      }
    } finally {
      reader.releaseLock()
    }
  })()
}

function splitLines(): TransformStream<string, string> {
  let buffer = ''

  return new TransformStream<string, string>({
    transform(chunk, controller) {
      buffer += chunk
      const messages = buffer.split(/\n\n|\r\n\r\n/)

      buffer = messages.pop() ?? ''
      for (const line of messages) {
        const dataLine = line
          .split(/\r?\n/)
          .find(line => line.startsWith('data: '))
        if (dataLine) controller.enqueue(dataLine)
      }
    },
    flush(controller) {
      if (buffer.trim()) {
        const dataLine = buffer
          .split(/\r?\n/)
          .find(line => line.startsWith('data: '))

        if (dataLine) controller.enqueue(dataLine)
      }
    }
  })
}
