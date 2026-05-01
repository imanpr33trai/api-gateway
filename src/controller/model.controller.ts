import type { Context } from 'hono'

import { modelService } from '../services/model.service'

export const modelController = async (c: Context) => {
  try {
    const models = await modelService()
    return c.json(models)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return c.json({ error: `Failed to fetch models, ${message}` }, 500)
  }
}
