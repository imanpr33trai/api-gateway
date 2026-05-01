import type { Context } from 'hono'

import { ConversationService } from '../services/conversation.service'

export const conversationController = {
  async getConversation(c: Context) {
    try {
      const { conversationId } = await c.req.param()

      const history =
        await ConversationService.getConversationHistory(conversationId)

      return c.json({ history })
    } catch (e) {
      return c.json({ error: e.message }, 500)
    }
  },
  async craeteConversation(c: Context) {
    try {
      const body = await c.req.json()

      const conversation = await ConversationService.createConversation(
        body.conversationId,
        body.title
      )
      return c.json({ conversation })
    } catch (e) {
      return c.json({ error: e.message }, 500)
    }
  }
}
