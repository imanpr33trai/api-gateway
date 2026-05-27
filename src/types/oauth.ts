import { createInsertSchema } from "drizzle-zod";
import z from "zod";
import { oauthToken, user } from "../db/schema";

export const createUserSchema = createInsertSchema(user);

export const OAuthTokenSchema = createInsertSchema(oauthToken);

export const PersistOuthTokensSchema = OAuthTokenSchema.omit({
     createdAt: true,
     updatedAt: true,
     id: true,
     lastError: true,
});
export const TokenRecordSchema = OAuthTokenSchema.pick({
     id: true,
     lastError: true,
     createdAt: true,
     updatedAt: true,
     accessToken: true,
     userId: true,
     providerId: true,
     refreshToken: true,
     tokenType: true,
     obtainedAt: true,
     scope: true,
     expiresAt: true,
}).extend({
     lastError: z
          .object({
               code: z.string(),
               message: z.string(),
               reason: z.string(),
               reloginRequired: z.boolean(),
               at: z.string(),
          })
          .nullable(),
});
export type OauthToken = z.infer<typeof PersistOuthTokensSchema>;
export type TokenRecord = z.infer<typeof TokenRecordSchema>;

type ProviderState = Record<string, unknown>;

interface CredentialEntry {
     source: string;
     access_token?: string;
     runtime_api_key?: string;
}

interface AuthStore {
     version: number;
     active_provider?: string;
     updated_at?: string;
     providers: Record<string, ProviderState>;
     credential_pool?: Record<string, CredentialEntry[]>;
}

interface OAuthState {
     provider: string;
     region?: string;
     portal_base_url: string;
     inference_base_url: string;
     client_id: string;
     scope: string;
     token_type: string;
     access_token: string;
     refresh_token: string;
     resource_url?: string;
     obtained_at: string;
     expires_at: string;
     expires_in: number;
     last_auth_error?: {
          provider: string;
          code: string;
          message: string;
          reason: string;
          relogin_required: boolean;
          at: string;
     };
}

interface TokenProvider {
     (): string;
}

interface RuntimeCredentials {
     providers: string;
     api_key: string | TokenProvider;
     base_url: string;
     source: string;
     auth_mode?: string;
     last_refresh?: string;
}

interface AuthStatus {
     logged_id: boolean;
     provider: string;
     region?: string;
     expires_at?: string;
     error?: string;
     auth_type?: string;
     has_refresh_token?: boolean;
     client_id?: string;
     redirect_uri?: string;
     scope?: string;
     api_base_url?: string;
}

export type { AuthStatus, AuthStore, OAuthState, RuntimeCredentials };
