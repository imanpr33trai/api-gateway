import { integer, sqliteTable } from "drizzle-orm/sqlite-core";

export const conversations = sqliteTable("conversations", {
     id: integer("id").primaryKey,
});
