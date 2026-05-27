import crypto from "node:crypto";

import { MinimaxOAuthError } from "../types/minimax-types";

/**
 * Sleep for `ms` milliseconds.
 */
export function sleep(ms: number): Promise<void> {
     return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a cryptographically strong UUID v4.
 */
export function uuid(): string {
     return crypto.randomUUID();
}

/**
 * PKCE S256 pair for OAuth flows.
 *
 * - `verifier`: 96-char base64url random string
 * - `challenge`: SHA-256 hash of verifier, base64url-encoded (RFC 7636)
 * - `state`: hex nonce for CSRF protection
 */
export function generatePKCEPair(): {
     verifier: string;
     challenge: string;
     state: string;
} {
     const verifier = crypto.randomBytes(64).toString("base64url").slice(0, 96);

     const challenge = crypto
          .createHash("sha256")
          .update(verifier)
          .digest("base64url");

     const state = crypto.randomBytes(16).toString("hex");

     return { verifier, challenge, state };
}

/**
 * MiniMax's `expired_in` field is ambiguous — it can be either:
 *   - A unix-ms **absolute** timestamp (large number)
 *   - A TTL in **seconds** (small number)
 *
 * Heuristic: if larger than half of `Date.now()`, treat as absolute ms.
 * Otherwise treat as TTL seconds.
 *
 * Returns expiry as a unix-epoch **second** timestamp.
 */
export function resolveTokenExpiry(expiredIn: number): number {
     const nowMs = Date.now();
     const raw = Number(expiredIn);

     if (raw > nowMs / 2) {
          return raw / 1000;
     }

     return Math.floor(Date.now() / 1000) + Math.max(1, raw);
}

/**
 * Build `application/x-www-form-urlencoded` request body from a record.
 */
export function encodeForm(data: Record<string, string>): string {
     return new URLSearchParams(data).toString();
}

/**
 * Parse an HTTP error response into a structured error, or return a generic message.
 */
export async function parseErrorBody(response: Response): Promise<string> {
     try {
          const body = await response.json();
          if (body && typeof body === "object") {
               const msg =
                    body.base_resp?.status_msg ??
                    body.error?.message ??
                    body.error;
               if (typeof msg === "string" && msg.trim()) {
                    return msg.trim();
               }
          }
     } catch {
          // ignore parse failures
     }

     try {
          const text = await response.text();
          if (text.trim()) {
               return text.trim();
          }
     } catch {
          // ignore
     }

     return `${response.status} ${response.statusText}`;
}

/**
 * Wrap a fetch that returns non-2xx into a structured error.
 * Throws MinimaxOAuthError on failure.
 */
export async function assertOk(
     response: Response,
     context: string,
): Promise<void> {
     if (response.ok) {
          return;
     }
     const detail = await parseErrorBody(response);
     throw new MinimaxOAuthError(`${context}: ${detail}`, {
          reloginRequired: response.status === 401,
     });
}

/**
 * Detect remote sessions where a loopback listener won't work.
 */
export function isRemoteSession(): boolean {
     if (process.env.SSH_CLIENT || process.env.SSH_TTY) {
          return true;
     }

     for (const variable of [
          "CLOUD_SHELL",
          "CODESPACES",
          "CODESPACE_NAME",
          "GITPOD_WORKSPACE_ID",
          "REPL_ID",
          "STACKBLITZ",
     ]) {
          if (process.env[variable]) {
               return true;
          }
     }

     return false;
}
