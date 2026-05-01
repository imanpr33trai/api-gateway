import type { Context } from 'hono'
import z from 'zod'

import { chatService } from '../services/chat.service'
import { ConversationService } from '../services/conversation.service'
import { ValidationError } from '../types/error.type'
import { ChatRequestSchema } from '../types/types'

export const chatController = async (c: Context) => {
  try {
    const requestData = await c.req.json()

    // Validate the request data
    const parsed = ChatRequestSchema.parse(requestData)

    // If conversationId is provided, validate and store the conversation
    if (parsed.conversationId) {
      // Get or create conversation
      const title =
        parsed.messages[0]?.content?.substring(0, 50) || 'New Conversation'
      await ConversationService.getOrCreateConversation(
        parsed.conversationId,
        title
      )

      // Save user message
      await ConversationService.saveMessage(
        parsed.conversationId,
        'user',
        parsed.messages[parsed.messages.length - 1]?.content || '',
        `msg-${Date.now()}`, // Generate a message ID
        parsed.model
      )
    }

    // Call the chat service
    const result = await chatService(
      parsed.messages.map(m => m.content).join('\n')
    )

    // If conversationId was provided, save the assistant's response
    if (parsed.conversationId) {
      await ConversationService.saveMessage(
        parsed.conversationId,
        'assistant',
        result.map(r => r.content).join('\n'),
        `resp-${Date.now()}`, // Generate a response ID
        parsed.model
      )
    }

    // Return the result with conversation history if applicable
    return c.json({
      result,
      conversationId: parsed.conversationId
        ? { id: parsed.conversationId }
        : undefined
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid request data', {
        issues: error.issues
      })
    }
    throw error
  }
}
