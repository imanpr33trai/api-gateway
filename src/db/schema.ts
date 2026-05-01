import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const conversations = sqliteTable('conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: text('conversation_id').notNull().unique(),
  title: text('title').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(
    sql`CURRENT_TIMESTAMP`
  ),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(
    sql`CURRENT_TIMESTAMP`
  )
})

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: text('conversation_id').notNull(),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(
    sql`CURRENT_TIMESTAMP`
  ),
  messageId: text('message_id').notNull(),
  model: text('model').notNull()
})
