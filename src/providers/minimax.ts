import crypto from "node:crypto";
import { MINIMAX } from "../constants";
import {
     createOAuthProvider,
     dbGetProvider,
     dbUpdateProvider,
     getActiveProviderByUserId,
     getLatestToken,
     quarantineTokens,
     saveTokens,
     updateProviderResourceUrl,
     updateToken,
} from "../oauth/minimax";
import { AuthError } from "../types";
export class MiniMaxOAuthClient {
     readonly clientId = MINIMAX.OAUTH.CLIENT_ID;
     readonly scope = MINIMAX.OAUTH.SCOPE;
     readonly grantType = MINIMAX.OAUTH.GRANT_TYPE;

     getPortalBase(region: string): string {
          const endpoints =
               region === "cn"
                    ? MINIMAX.ENDPOINTS.cn
                    : MINIMAX.ENDPOINTS.global;
          return endpoints.portal;
     }

     getInferenceBase(region: string): string {
          const endpoints =
               region === "cn"
                    ? MINIMAX.ENDPOINTS.cn
                    : MINIMAX.ENDPOINTS.global;
          return endpoints.inference;
     }

     generatePKCE(): {
          codeVerifier: string;
          codeChallenge: string;
          state: string;
     } {
          const codeVerifier = crypto
               .randomBytes(48)
               .toString("base64url")
               .slice(0, 96);

          const codeChallenge = crypto
               .createHash("sha256")
               .update(codeVerifier)
               .digest()
               .toString("base64url");
          const state = crypto.randomBytes(16).toString("base64url");
          return { codeChallenge, codeVerifier, state };
     }

     resolveExpiryUnix(expiredIn: number): number {
          const nowMs = Date.now();
          const raw = Math.floor(expiredIn);

          if (raw > nowMs / 2) {
               return raw / 1000;
          }
          return nowMs / 1000 + Math.max(1, raw);
     }

     async requestUserCode(opts: {
          portalBaseUrl: string;
          codeChallenge: string;
          state: string;
     }): Promise<{
          userCode: string;
          verificationUri: string;
          expiresIn: number;
          intervalMs: number;
     }> {
          const res = await fetch(`${opts.portalBaseUrl}/oauth/code`, {
               method: "POST",
               headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Accept: "application/json",
                    "x-request-id": crypto.randomUUID(),
               },
               body: new URLSearchParams({
                    response_type: "code",
                    client_id: this.clientId,
                    scope: this.scope,
                    code_challenge: opts.codeChallenge,
                    code_challenge_method: "S256",
                    state: opts.state,
               }),
          });
          if (!res.ok) {
               const text = await res.text().catch(() => "");
               throw new AuthError(
                    `MiniMax /oauth/code failed (${res.status}): ${text || res.statusText}`,
                    {
                         provider: "minimax-oauth",
                         code: "authorization_failed",
                         statusCode: res.status,
                    },
               );
          }

          const payload = await res.json();

          if (payload.state !== opts.state) {
               throw new AuthError("MiniMax state mismatch (possible CSRF).", {
                    provider: "minimax-oauth",
                    code: "state_mismatch",
               });
          }
          return {
               userCode: String(payload.user_code),
               verificationUri: String(payload.verification_uri),
               expiresIn: Number(payload.expires_in),
               intervalMs: Number(payload.interval ?? 2000),
          };
     }

     async pollToken(opts: {
          portalBaseUrl: string;
          userCode: string;
          codeVerifier: string;
          expiredIn: number;
          intervalMs: number;
          singal?: AbortSignal;
     }): Promise<{
          accessToken: string;
          refreshToken: string;
          resourceUrl?: string;
          expiredIn: number;
          notificationMessage?: string;
     }> {
          const nowMs = Date.now();
          const raw = Math.floor(opts.expiredIn);
          let deadline: number;

          if (raw > nowMs / 2) {
               deadline = raw / 1000;
          } else {
               deadline = nowMs / 1000 + Math.max(1, raw);
          }

          const interval = Math.max(2.0, (opts.intervalMs ?? 2000) / 1000.0);

          while (Date.now() / 1000 < deadline) {
               const res = await fetch(`${opts.portalBaseUrl}/oauth/token`, {
                    method: "POST",
                    headers: {
                         "Content-Type": "application/x-www-form-urlencoded",
                         Accept: "application/json",
                    },
                    body: new URLSearchParams({
                         grant_type: this.grantType,
                         client_id: this.clientId,
                         code_verifier: opts.codeVerifier,
                         user_code: opts.userCode,
                    }),
                    signal: opts.singal,
               });

               if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    throw new AuthError(
                         `MiniMax /oauth/token failed (${res.status}): ${text || res.statusText}`,
                         {
                              provider: "minimax-oauth",
                              code: "token_exchange_failed",
                              statusCode: res.status,
                         },
                    );
               }
               const payload = await res.json();
               const status = String(payload.status ?? "pending");

               if (status === "error") {
                    throw new AuthError("MiniMax OAUTH reported an error.", {
                         provider: "minimax-oauth",
                         code: "authorization_denied",
                    });
               }

               if (status === "success") {
                    const accessToken = String(payload.access_token ?? "");
                    const refreshToken = String(payload.refresh_token ?? "");
                    const expiredIn = Number(payload.expires_in ?? 0);

                    return {
                         accessToken,
                         refreshToken,
                         expiredIn,
                         resourceUrl: payload.resource_url
                              ? String(payload.resource_url)
                              : undefined,
                         notificationMessage: payload.notification_message
                              ? String(payload.notification_message)
                              : undefined,
                    };
               }
               await new Promise((resolve) =>
                    setTimeout(resolve, interval * 1000),
               );
          }
          throw new AuthError(
               "MiniMax OAuth timed out before authorization completed.",
               { code: "timeout", provider: "minimax-oauth" },
          );
     }

     async refreshToken(opts: {
          portalBaseUrl: string;
          refreshToken: string;
          clientId: string;
     }): Promise<{
          accessToken: string;
          refreshToken: string;
          expiredIn: number;
     }> {
          const res = await fetch(`${opts.portalBaseUrl}/oauth/token`, {
               method: "POST",
               headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Accept: "application/json",
               },
               body: new URLSearchParams({
                    grant_type: "refresh_token",
                    client_id: opts.clientId,
                    refresh_token: opts.refreshToken,
               }),
          });
          if (!res.ok) {
               const text = (await res.text()).toLowerCase();
               const relogin = [
                    "invalid_grant",
                    "refresh_token_reused",
                    "invalid_refresh_token",
               ].some((m) => text.includes(m));
               throw new AuthError(
                    `MiniMax token refresh failed (${res.status}): ${await res.text().catch(() => res.statusText)}`,
                    {
                         provider: "minimax-oauth",
                         code: "refresh_failed",
                         relogin_required: relogin,
                         statusCode: res.status,
                    },
               );
          }
          const payload = await res.json();

          if (payload.status !== "success") {
               throw new AuthError("MiniMax refresh did not return success.", {
                    provider: "minimax-oauth",
                    code: "refresh_failed",
                    relogin_required: true,
               });
          }
          return {
               accessToken: String(payload.access_token),
               expiredIn: Number(payload.expires_in ?? 0),
               refreshToken: String(payload.refresh_token ?? opts.refreshToken),
          };
     }

     async login(opts: {
          userId: string;
          region?: string;
          singal?: AbortSignal;
     }): Promise<{
          userCode: string;
          verificationUri: string;
          intervalMs: number;
          providerRecordId: string;
          pollForToken: () => Promise<{
               accessToken: string;
               refreshToken: string;
               resourceUrl?: string;
               expiredIn: number;
               notificationMessage?: string;
          }>;
     }> {
          const region = opts.region ?? "global";
          const portalBaseUrl = this.getPortalBase(region);
          const inferenceBaseUrl = this.getInferenceBase(region);
          const { codeChallenge, codeVerifier, state } = this.generatePKCE();

          const codeData = await this.requestUserCode({
               portalBaseUrl,
               codeChallenge,
               state,
          });

          let provider = await getActiveProviderByUserId(
               opts.userId,
               "minimax-oauth",
          );

          if (provider) {
               await dbUpdateProvider(provider?.id, {
                    region,
                    portalBaseUrl,
                    codeChallenge,
                    state,
               });
          } else {
               provider = await createOAuthProvider({
                    userId: opts.userId,
                    providerId: "minimax-oauth",
                    region,
                    portalBaseUrl,
                    inferenceBaseUrl,
                    clientId: this.clientId,
                    scope: this.scope,
               });
          }

          if (!provider) {
               throw new Error("Failed to obtain OAuth provider record");
          }
          return {
               userCode: codeData.userCode,
               verificationUri: codeData.verificationUri,
               intervalMs: codeData.intervalMs,
               providerRecordId: provider?.id,
               pollForToken: async () => {
                    const tokens = await this.pollToken({
                         portalBaseUrl,
                         userCode: codeData.userCode,
                         codeVerifier,
                         expiredIn: codeData.expiresIn,
                         intervalMs: codeData.intervalMs,
                         singal: opts.singal,
                    });

                    const expiredAtUnix = this.resolveExpiryUnix(
                         tokens.expiredIn,
                    );
                    const expiresAt = new Date(expiredAtUnix * 1000);

                    await saveTokens({
                         providerId: provider.id,
                         userId: opts.userId,
                         accessToken: tokens.accessToken,
                         refreshToken: tokens.refreshToken,
                         tokenType: "Bearer",
                         scope: this.scope,
                         expiresAt,
                    });

                    if (tokens.resourceUrl) {
                         await updateProviderResourceUrl(
                              provider?.id,
                              tokens.resourceUrl,
                         );
                    }
                    return tokens;
               },
          };
     }

     async ensureFreshToken(
          userId: string,
          providerRecordId: string,
     ): Promise<string> {
          const token = await getLatestToken(providerRecordId, userId);

          if (!token || !token.accessToken) {
               throw new AuthError("Not logged into MiniMax OAuth", {
                    provider: "minimax-oauth",
                    code: "not_logged_in",
                    relogin_required: true,
               });
          }

          const refreshSkewMs = MINIMAX.OAUTH.REFRESH_SKEW_SECONDS * 1000;
          if (token.expiresAt.getTime() - Date.now() > refreshSkewMs) {
               return token.accessToken;
          }

          if (!token.refreshToken) {
               throw new AuthError(
                    "MiniMax OAuth state has no refresh_token; Please re-login.",
                    {
                         provider: "minimax-oauth",
                         code: "not_refresh_token",
                         relogin_required: true,
                    },
               );
          }

          const provider = await dbGetProvider(providerRecordId);
          if (!provider) {
               throw new AuthError("Provider record not found.", {
                    code: "provider_not_found",
               });
          }

          try {
               const refreshed = await this.refreshToken({
                    portalBaseUrl: provider.portalBaseUrl,
                    clientId: provider.clientId,
                    refreshToken: token.refreshToken,
               });

               await updateToken(providerRecordId, userId, {
                    accessToken: refreshed.accessToken,
                    refreshToken: refreshed.refreshToken,
                    expiresAt: new Date(
                         this.resolveExpiryUnix(refreshed.expiredIn) * 1000,
                    ),
               });
          } catch (error) {
               if (error instanceof AuthError && error.relogin_required) {
                    await quarantineTokens(providerRecordId, userId, error);
               }
          }
     }
}
