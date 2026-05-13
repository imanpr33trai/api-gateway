// src/controller/generate.controller.ts
import type { Context } from 'hono'
import { z } from 'zod'

import { generateCompletionService } from '../services/chat.service'
import { ValidationError } from '../types'
import { handleAsync } from '../utils/errorHandler'

const GenerateRequestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional()
})

export const generateController = async (c: Context) => {
  try {
    const body = await c.req.json()
    const { prompt, model } = GenerateRequestSchema.parse(body)

    const [content, error] = await handleAsync(
      generateCompletionService(prompt, model)
    )
    if (error) throw error

    return c.json({ content })
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new ValidationError('Invalid request body', {
        issues: err.issues
      })
    }
    throw err
  }
}
