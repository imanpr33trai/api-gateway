import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "../db";
import {
     inferenceSessions,
     oauthProvider,
     oauthToken,
     user,
} from "../db/schema";
import type { AuthError } from "../types";
import type { OauthToken, TokenRecord } from "../types/oauth";

export const createUser = async (email: string, name?: string) => {
     const [u] = await db
          .insert(user)
          .values({ email, name: name ?? null })
          .returning();
     return u;
};

export const getUserById = async (id: string) => {
     const [u] = await db.select().from(user).where(eq(user.id, id));
     return u ?? null;
};

export const getUserByEmail = async (email: string) => {
     const [u] = await db.select().from(user).where(eq(user.email, email));
     return u ?? null;
};

export const createOAuthProvider = async (input: {
     userId: string;
     providerId: string;
     region: string;
     portalBaseUrl: string;
     inferenceBaseUrl: string;
     clientId: string;
     scope: string;
     resourceUrl?: string;
}) => {
     const [provider] = await db
          .insert(oauthProvider)
          .values({
               ...input,
               resourceUrl: input.resourceUrl ?? null,
               isActive: true,
          })
          .returning();

     return provider ?? null;
};

export async function getActiveProviderByUserId(
     userId: string,
     providerId: string,
) {
     const [provider] = await db
          .select()
          .from(oauthProvider)
          .where(
               and(
                    eq(oauthProvider.userId, userId),
                    eq(oauthProvider.providerId, providerId),
                    eq(oauthProvider.isActive, true),
               ),
          );
     return provider ?? null;
}
export async function deactiveProvider(id: string) {
     await db
          .update(oauthProvider)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(oauthProvider.id, id));
}

export const updateProviderResourceUrl = async (
     id: string,
     resourceUrl: string,
) => {
     await db
          .update(oauthProvider)
          .set({ resourceUrl, updatedAt: new Date() })
          .where(eq(oauthProvider.id, id));
};

export async function saveTokens(input: OauthToken) {
     await db
          .delete(oauthToken)
          .where(
               and(
                    eq(oauthToken.providerId, input.providerId),
                    eq(oauthToken.userId, input.userId),
               ),
          );

     const [token] = await db
          .insert(oauthToken)
          .values({
               providerId: input.providerId,
               userId: input.userId,
               accessToken: input.accessToken,
               refreshToken: input.refreshToken,
               tokenType: input.tokenType,
               scope: input.scope,
               expiresAt: input.expiresAt,
          })
          .returning();
     return token;
}

export async function getLatestToken(
     providerId: string,
     userId: string,
): Promise<TokenRecord | null> {
     const [token] = await db
          .select({
               id: oauthToken.id,
               lastError: oauthToken.lastError,
               updatedAt: oauthToken.updatedAt,
               createdAt: oauthToken.createdAt,
          })
          .from(oauthToken)
          .where(
               and(
                    eq(oauthToken.providerId, providerId),
                    eq(oauthToken.userId, userId),
               ),
          )
          .orderBy(desc(oauthToken.createdAt))
          .limit(1);

     return token ?? null;
}

export const updateToken = async (
     providerId: string,
     userId: string,
     data: {
          accessToken?: string;
          refreshToken?: string;
          expiresAt?: Date;
     },
) => {
     const updateData: Record<string, unknown> = { updatedAt: new Date() };
     if (data.accessToken) updateData.accessToken = data.accessToken;
     if (data.refreshToken) updateData.refreshToken = data.refreshToken;
     if (data.expiresAt) updateData.expiresAt = data.expiresAt;

     await db
          .update(oauthToken)
          .set(updateData)
          .where(
               and(
                    eq(oauthToken.providerId, providerId),
                    eq(oauthToken.userId, userId),
               ),
          );
};

export const quarantineTokens = async (
     providerId: string,
     userId: string,
     error: AuthError,
) => {
     await db
          .update(oauthToken)
          .set({
               lastError: {
                    code: error.code,
                    message: error.message,
                    reason: "runtime_refresh_failure",
                    reloginRequired: error.relogin_required,
                    at: new Date().toISOString(),
               },
               accessToken: null,
               refreshToken: null,
               updatedAt: new Date(),
          })
          .where(
               and(
                    eq(oauthToken.providerId, providerId),
                    eq(oauthToken.userId, userId),
               ),
          );
};

export const getExpiringTokens = async (skewSeconds: number) => {
     const skewInterval = sql`INTERNAL '${sql.raw(String(skewSeconds))} seconds'`;

     return db
          .select()
          .from(oauthToken)
          .where(lt(oauthToken.expiresAt, sql`NOW() + ${skewInterval}`));
};

export async function getAuthStatus(
     userId: string,
     providerId: string,
): Promise<{
     loggedIn: boolean;
     provider?: string;
     region?: string;
     expiresAt: string | null;
     hasRefreshToken: boolean;
     lastError: string | null;
}> {
     const provider = await getActiveProviderByUserId(userId, providerId);
     if (!provider) {
          return {
               loggedIn: false,
               expiresAt: null,
               hasRefreshToken: false,
               lastError: null,
          };
     }

     const token = await getLatestToken(providerId, userId);
     if (!token || !token.accessToken) {
          return {
               lastError: token?.lastError?.message ?? null,
               expiresAt: null,
               hasRefreshToken: false,
               loggedIn: false,
               provider: providerId,
               region: provider.region,
          };
     }

     return {
          expiresAt: token.expiresAt.toISOString(),
          hasRefreshToken: !!token.refreshToken,
          lastError: token.lastError?.message ?? null,
          loggedIn: token.expiresAt > new Date(),
          provider: providerId,
          region: provider.region,
     };
}

export async function startInferenceSession(
     userId: string,
     providerId: string,
     model: string,
) {
     const [session] = await db
          .insert(inferenceSessions)
          .values({ userId, providerId, model })
          .returning();
     return session;
}

export const endInferenceSession = async (id: string, tokenExpired = false) => {
     await db
          .update(inferenceSessions)
          .set({ endedAt: new Date(), tokenExpired })
          .where(eq(inferenceSessions.id, id));
};

export const dbGetProvider = async (id: string) => {
     const [p] = await db
          .select()
          .from(oauthProvider)
          .where(eq(oauthProvider.id, id));
     return p ?? null;
};

export const dbUpdateProvider = async (
     id: string,
     data: Record<string, unknown>,
) => {
     await db
          .update(oauthProvider)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(oauthProvider.id, id));
};
