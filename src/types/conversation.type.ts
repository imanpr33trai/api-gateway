import { z } from 'zod'

export const ConversationIdSchema = z.string().regex(/^chatcmpl-[a-zA-Z0-9]+$/)
export type ConversationId = z.infer<typeof ConversationIdSchema>

export const MessageSchema = z.object({
  id: z.number(),
  conversationId: ConversationIdSchema,
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.number(),
  messageId: z.string(),
  model: z.string()
})

export const ConversationSchema = z.object({
  conversationId: ConversationIdSchema,
  id: z.number(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number()
})
