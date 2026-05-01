import { eq } from "drizzle-orm";

import { conversations, db, messages } from "../db";
import { ConversationIdSchema } from "../types/conversation.type";
import { ValidationError } from "../types/error.type";

export class ConversationService {
     static async createConversation(conversationId: string, title: string) {
          try {
               ConversationIdSchema.parse(conversationId);

               const result = await db
                    .insert(conversations)
                    .values({
                         conversationId,
                         title,
                         createdAt: new Date(),
                         updatedAt: new Date(),
                    })
                    .returning();

               return result[0];
          } catch (error) {
               if (
                    error instanceof Error &&
                    error.message.includes("Invalid")
               ) {
                    throw new ValidationError(
                         "Invalid conversation ID format",
                         {
                              cause: error,
                         },
                    );
               }
          }
     }

     static async saveMessage(
          conversationId: string,
          role: "user" | "assistant",
          content: string,
          messageId: string,
          model: string,
     ) {
          try {
               ConversationIdSchema.parse(conversationId);

               const result = await db
                    .insert(messages)
                    .values({
                         conversationId,
                         role,
                         content,
                         timestamp: new Date(),
                         messageId,
                         model,
                    })
                    .returning();

               return result[0];
          } catch (error) {
               if (
                    error instanceof Error &&
                    error.message.includes("Invalid")
               ) {
                    throw new ValidationError(
                         "Invalid conversation ID format",
                         {
                              cause: error,
                         },
                    );
               }
          }
     }

     static async getConversationHistory(conversationId: string) {
          try {
               ConversationIdSchema.parse(conversationId);

               return await db
                    .select()
                    .from(messages)
                    .where(eq(messages.conversationId, conversationId))
                    .orderBy(messages.timestamp);
          } catch (error) {
               if (
                    error instanceof Error &&
                    error.message.includes("Invalid")
               ) {
                    throw new ValidationError(
                         "Invalid conversation ID format",
                         {
                              cause: error,
                         },
                    );
               }
          }
     }

     static async getConversation(conversationId: string) {
          try {
               ConversationIdSchema.parse(conversationId);

               return await db
                    .select()
                    .from(conversations)
                    .where(eq(conversations.conversationId, conversationId));
          } catch (error) {
               if (
                    error instanceof Error &&
                    error.message.includes("Invalid")
               ) {
                    throw new ValidationError(
                         "Invalid conversation ID format",
                         {
                              cause: error,
                         },
                    );
               }
          }
     }

     static async getOrCreateConversation(
          conversationId: string,
          title: string,
     ) {
          try {
               // Try to get existing conversation
               const existing = await this.getConversation(conversationId);
               if (!existing) {
                    return await this.createConversation(conversationId, title);
               }
               if (existing.length > 0) {
                    return existing[0];
               }

               // Create new conversation if it doesn't exist
               return await this.createConversation(conversationId, title);
          } catch (error) {
               console.error(error);
          }
     }
}
