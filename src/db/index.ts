import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { conversations, messages } from "./schema";
const sqlite = new Database(process.env.DB_FILE_NAME);
const db = drizzle({ client: sqlite });

export { conversations, db, messages };

export type * from "./schema";
await migrate(db, { migrationsFolder: "./drizzle" });
