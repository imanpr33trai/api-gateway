import { relations, sql } from "drizzle-orm";
import {
     boolean,
     index,
     jsonb,
     pgTable,
     text,
     timestamp,
     uuid,
     varchar,
} from "drizzle-orm/pg-core";

// Reusable timestamps pattern
export const timestamps = {
     createdAt: timestamp("created_at", {
          mode: "date",
          precision: 3,
          withTimezone: true,
     })
          .defaultNow()
          .notNull(),
     updatedAt: timestamp("updated_at", {
          mode: "date",
          precision: 3,
          withTimezone: true,
     })
          .defaultNow()
          .notNull()
          .$onUpdateFn(() => new Date()),
};

export const user = pgTable("users", {
     id: uuid().primaryKey().defaultRandom(),
     name: text("name"),

     email: varchar({ length: 255 }).notNull().unique(),
     ...timestamps,
});

export const oauthProvider = pgTable(
     "oauth_providers",
     {
          id: uuid("id").primaryKey().defaultRandom(),
          userId: uuid("user_id")
               .notNull()
               .references(() => user.id, { onDelete: "cascade" }),
          providerId: text("provider_id").notNull(),
          region: text("region").notNull(),
          portalBaseUrl: text("portal_base_url").notNull(),
          inferenceBaseUrl: text("inference_base_url").notNull(),
          clientId: text("client_id").notNull(),
          scope: text("scope").notNull(),
          resourceUrl: text("resource_url"),
          isActive: boolean("is_active").default(true),
          ...timestamps,
     },
     (table) => [
          index("oauth_provider_user_idx").on(table.userId),
          index("oauth_providers_active_idx")
               .on(table.isActive)
               .where(sql`${table.isActive}= true`),
     ],
);

export const oauthToken = pgTable("oauth_tokens", {
     id: uuid("id").primaryKey().defaultRandom(),
     providerId: uuid("provider_id")
          .notNull()
          .references(() => oauthProvider.id, { onDelete: "cascade" }),
     userId: uuid("user_id")
          .notNull()
          .references(() => user.id, { onDelete: "cascade" }),
     accessToken: text("access_token").notNull(),
     refreshToken: text("refresh_token").notNull(),
     tokenType: text("token_type").notNull().default("Bearer"),
     scope: text("scope").notNull(),
     expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
     obtainedAt: timestamp("obtained_at", { withTimezone: true })
          .defaultNow()
          .notNull(),
     lastError: jsonb("last_error").$type<{
          code: string;
          message: string;
          reason: string;
          reloginRequired: boolean;
          at: string;
     } | null>(),
     ...timestamps,
});

export const inferenceSessions = pgTable("inference_sessions", {
     id: uuid("id").primaryKey().defaultRandom(),
     userId: uuid("user_id")
          .notNull()
          .references(() => user.id, { onDelete: "cascade" }),
     providerId: uuid("provider_id")
          .notNull()
          .references(() => oauthProvider.id, { onDelete: "cascade" }),
     model: text("model").notNull(),
     startedAt: timestamp("started_at", { withTimezone: true })
          .defaultNow()
          .notNull(),
     endedAt: timestamp("ended_at", { withTimezone: true }),
     tokenExpired: boolean("token_expired").default(false),
});

//Relations

export const userRelations = relations(user, ({ many }) => ({
     oauthProviders: many(oauthProvider),
     oauthTokens: many(oauthToken),
     inferenceSessions: many(inferenceSessions),
}));

export const oauthProviderRelations = relations(
     oauthProvider,
     ({ many, one }) => ({
          user: one(user, {
               fields: [oauthProvider.userId],
               references: [user.id],
          }),
          tokens: many(oauthToken),
          inferenceSessions: many(inferenceSessions),
     }),
);

export const oauthTokenRelations = relations(oauthToken, ({ one }) => ({
     provider: one(oauthProvider, {
          fields: [oauthToken.providerId],
          references: [oauthProvider.id],
     }),
     user: one(user, {
          fields: [oauthToken.userId],
          references: [user.id],
     }),
}));

export const inferenceSessionsRelations = relations(
     inferenceSessions,
     ({ one }) => ({
          user: one(user, {
               fields: [inferenceSessions.userId],
               references: [user.id],
          }),
          provider: one(oauthProvider, {
               fields: [inferenceSessions.providerId],
               references: [oauthProvider.id],
          }),
     }),
);
