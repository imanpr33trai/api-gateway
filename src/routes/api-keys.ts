import { Hono } from 'hono'

import { listApiKeys } from '../auth/user-store'
import { openAIErrorResponse } from '../lib/openai-error'

export const apiKeysRouter = new Hono()

  .get('/users/:userId/keys', async c => {
    const userId = Number(c.req.param('userId'))
    if (Number.isNaN(userId)) {
      return openAIErrorResponse(c, 'Invalid user ID', {
        code: 'invalid_request',
        status: 400
      })
    }

    const keys = await listApiKeys(userId)
    return c.json({ keys })
  })
