import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import z from 'zod'

import {
  createApiKey,
  createUser,
  getUserByID,
  resolveUserFromApiKey
} from '../auth/user-store'
import { userInsertSchema } from '../db/schema'
import { getUserByEmail } from '../oauth/minimax'

export const authRouter = new Hono()
  .post(
    '/signup',
    zValidator(
      'json',
      userInsertSchema.pick({ email: true, displayName: true })
    ),
    async c => {
      const { email, displayName } = c.req.valid('json')

      try {
        const existing = await getUserByEmail(email)
        if (existing) {
          return c.json({ error: 'Email already registered' }, 409)
        }

        const user = await createUser(email, displayName)
        const apiKey = await createApiKey(user.id, 'token-store')

        return c.json({
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName
          },
          apiKey: {
            key: apiKey.rawKey,
            prefix: apiKey.record.keyPrefix,
            label: apiKey.record.label
          },
          message:
            'Save this API key — it will not be shown again. ' +
            'Use it as the Bearer token in Authorization headers.'
        })
      } catch (err) {
        return c.json(
          { error: err instanceof Error ? err.message : 'Signup failed' },
          400
        )
      }
    }
  )
  .post(
    '/verify',
    zValidator('json', z.object({ apiKey: z.string().min(10) })),
    async c => {
      const { apiKey } = c.req.valid('json')

      try {
        const result = await resolveUserFromApiKey(apiKey)
        if (!result) {
          return c.json(
            { valid: false, error: 'Invalid or expired API Key' },
            401
          )
        }
        return c.json({
          valid: true,
          user: {
            id: result.user.id,
            email: result.user.email,
            displayName: result.user.displayName
          }
        })
      } catch (err) {
        return c.json({
          error: err instanceof Error ? err.message : 'Verification failed'
        })
      }
    }
  )
  .post(
    '/login/start',
    zValidator(
      'json',
      z.object({
        provider: z.string(),
        region: z.string().optional().default('global')
      })
    ),
    async c => {
      const { provider, region } = c.req.valid('json')
      const userId = getUserByID(c) ?? 0

      try {
        const result = await startL
      } catch (error: unknown) {
        console.error(error)
      }
    }
  )
