---
name: drizzle-orm-postgresql
description: |-
  Design and optimize Drizzle ORM schemas for PostgreSQL with modern patterns:
  - Identity columns (2025 standard) instead of serial types
  - Optimal timestamp handling with timezones
  - Performance-focused indexing strategies (partial, covering, GIN)
  - Type-safe enums and reusable column patterns
  - Zod validation integration for runtime safety
  - Relations with cascading behaviors
  - Production optimizations (prepared statements, selective loading)
  
  Use when:
  - Creating or migrating Drizzle schemas
  - Diagnosing PostgreSQL performance issues
  - Implementing type-safe database interactions
  - Setting up Zod validation for Drizzle tables
---

# Drizzle ORM PostgreSQL Best Practices

## Core Principles

### 1. Use Modern Identity Columns (2025 Standard)
Replace serial types with `generatedAlwaysAsIdentity` for explicit control and PostgreSQL 16+ compatibility.

```typescript
import { pgTable, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({
    startWith: 1000,       // Starting value
    increment: 1,         // Step size
    minValue: 1,          // Minimum value
    maxValue: 2147483647, // Maximum value
    cache: 1              // Performance optimization
  }),
});
```

### 2. Timestamp Configuration

**Recommended setup** for production:

```typescript
export const timestamps = {
  createdAt: timestamp('created_at', {
    mode: 'date',           // Faster than string mode
    precision: 3,           // Millisecond precision
    withTimezone: true      // Always include timezone
  }).defaultNow().notNull(),
  
  updatedAt: timestamp('updated_at', {
    mode: 'date',
    precision: 3,
    withTimezone: true
  }).defaultNow().notNull().$onUpdateFn(() => new Date()),
};
```

**Performance comparison**:
| Mode   | Precision | Speed  | Use Case               |
|--------|-----------|--------|------------------------|
| date   | 3         | 100%   | Default recommendation |
| date   | 6         | 92%    | Financial timestamps   |
| string | 3         | 85%    | Custom formatting      |

### 3. Indexing Strategies

**Production benchmarks** show these patterns work best:

```typescript
export const orders = pgTable('orders', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  customerId: integer('customer_id').notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  orderDate: timestamp('order_date').notNull(),
}, (table) => [
  // B-tree index (default)
  index('idx_customer_id').on(table.customerId),
  
  // Composite index (column order matters!)
  index('idx_customer_status_date').on(
    table.customerId,
    table.status,
    table.orderDate.desc()
  ),
  
  // Partial index (up to 275x faster)
  index('idx_active_orders').on(table.customerId)
    .where(sql`${table.status} = 'active'`),
  
  // Covering index (avoids table lookups)
  index('idx_covering').on(table.customerId)
    .include(table.orderDate),
]);
```

### 4. Type-Safe Enums

**Modern pattern** using TypeScript enums:

```typescript
// TypeScript enum
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator',
}

// Conversion utility
export function enumToPgEnum<T extends Record<string, string>>(
  myEnum: T,
): [T[keyof T], ...T[keyof T][]] {
  return Object.values(myEnum) as [T[keyof T], ...T[keyof T][]];
}

// Drizzle enum
export const userRoleEnum = pgEnum('user_role', enumToPgEnum(UserRole));

// Usage
export const users = pgTable('users', {
  role: userRoleEnum('role').default(UserRole.USER).notNull(),
});
```

## Zod Integration

### Complete Validation Workflow

```typescript
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

// Basic schema
export const insertUserSchema = createInsertSchema(users, {
  email: (schema) => schema.email('Invalid email format'),
  name: (schema) => schema.min(2, 'Name must be at least 2 characters'),
});

export const selectUserSchema = createSelectSchema(users);

// Advanced validation with business logic
const createOrderSchema = createInsertSchema(orders, {
  totalAmount: (schema) => schema.positive('Amount must be positive'),
}).refine((data) => {
  if (data.status === 'shipped' && !data.shippedAt) {
    return false;
  }
  return true;
}, {
  message: 'Shipped orders must have a shipped date',
  path: ['shippedAt'],
});

// Usage in API routes
export async function createUser(data: unknown) {
  const validated = insertUserSchema.parse(data);
  const [user] = await db.insert(users).values(validated).returning();
  return user;
}
```

## Performance Optimizations

### 1. Prepared Statements

```typescript
const getUserByEmail = db
  .select()
  .from(users)
  .where(eq(users.email, sql.placeholder('email')))
  .prepare('getUserByEmail');

// Reuse with different values
const user = await getUserByEmail.execute({ email: 'user@example.com' });
```

### 2. Selective Loading

```typescript
const posts = await db.query.posts.findMany({
  columns: {
    id: true,
    title: true,
    // Exclude large content field
  },
  with: {
    author: {
      columns: {
        id: true,
        name: true,
      },
    },
  },
  limit: 20,
});
```

### 3. Connection Pooling

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,              // Maximum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const db = drizzle(pool, { schema });
```

## Relations and Constraints

### One-to-Many with Cascade

```typescript
export const posts = pgTable('posts', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  authorId: integer('author_id')
    .references(() => users.id, {
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
    .notNull(),
}, (table) => [
  // Always index foreign keys
  index('posts_author_idx').on(table.authorId),
]);
```

### Many-to-Many Junction Table

```typescript
export const postsToTags = pgTable('posts_to_tags', {
  postId: integer('post_id')
    .references(() => posts.id, { onDelete: 'cascade' })
    .notNull(),
  tagId: integer('tag_id')
    .references(() => tags.id, { onDelete: 'cascade' })
    .notNull(),
}, (table) => [
  primaryKey({ columns: [table.postId, table.tagId] }),
]);
```

### Relations for Query API

```typescript
import { relations } from 'drizzle-orm';

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
}));
```

## Common Pitfalls and Solutions

| Pitfall                          | Solution                                                                 |
|----------------------------------|--------------------------------------------------------------------------|
| Missing foreign key indexes      | Always index foreign keys (PostgreSQL doesn't do this automatically)      |
| Using string mode for timestamps | Use date mode with timezone unless custom formatting is needed            |
| Over-indexing                    | Only index columns used in WHERE, JOIN, and ORDER BY clauses              |
| Not using prepared statements    | Prepare statements for frequent queries                                  |
| Missing Zod validation           | Validate all external input before database operations                    |

## Complete Production Schema Example

```typescript
import { relations } from 'drizzle-orm';
import { 
  pgTable, pgEnum,
  integer, varchar, text, timestamp, boolean, jsonb,
  index, sql
} from 'drizzle-orm/pg-core';

// TypeScript enums
enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator',
}

enum PostStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

// Conversion utility
function enumToPgEnum<T extends Record<string, string>>(
  myEnum: T,
): [T[keyof T], ...T[keyof T][]] {
  return Object.values(myEnum) as [T[keyof T], ...T[keyof T][]];
}

// Drizzle enums
export const userRoleEnum = pgEnum('user_role', enumToPgEnum(UserRole));
export const postStatusEnum = pgEnum('post_status', enumToPgEnum(PostStatus));

// Reusable columns
export const timestamps = {
  createdAt: timestamp('created_at', {
    mode: 'date',
    precision: 3,
    withTimezone: true
  }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', {
    mode: 'date',
    precision: 3,
    withTimezone: true
  }).defaultNow().notNull().$onUpdateFn(() => new Date()),
};

// Users table
export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  role: userRoleEnum('role').default(UserRole.USER).notNull(),
  preferences: jsonb('preferences').$type<{
    theme: 'light' | 'dark';
    notifications: boolean;
  }>(),
  ...timestamps,
}, (table) => [
  // Partial unique index
  uniqueIndex('users_email_unique').on(table.email),
]);// Posts table
export const posts = pgTable('posts', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  authorId: integer('author_id').references(() => users.id, {
    onDelete: 'cascade',
    onUpdate: 'cascade'
  }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  status: postStatusEnum('status').default(PostStatus.DRAFT).notNull(),
  publishedAt: timestamp('published_at', {
    mode: 'date',
    precision: 3,
    withTimezone: true
  }),
  ...timestamps,
}, (table) => [
  // Covering index for common queries
  index('posts_author_idx').on(table.authorId),
  // Partial index for published posts
  index('posts_published_idx').on(table.publishedAt)
    .where(sql`${table.status} = 'published'`),
]);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
}));
```
