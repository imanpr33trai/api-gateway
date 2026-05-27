import crypto from "node:crypto"

import { Hono } from "hono"

import { MINIMAX } from "../constants"
import {
  buildAuthState,
  pollForToken,
  refreshTokens,
} from "../providers/minimax"

// In-memory store for OAuth state (replace with DB in production)
interface StoredSession {
  verifier: string
  challenge: string
  state: string
  region: "global" | "cn"
}

const sessions = new Map<string, StoredSession>()

export const minimaxAuthRoute = new Hono()

/**
 * POST /minimax/auth/init
 * Start the OAuth device-code flow.
 * Returns user_code + verification_uri for the user to approve.
 * Body: { region?: "global" | "cn" }
 */
minimaxAuthRoute.post("/minimax/auth/init", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const region: "global" | "cn" = body.region === "cn" ? "cn" : "global"
  const endpoints = region === "cn" ? MINIMAX.ENDPOINTS.cn : MINIMAX.ENDPOINTS.global

  // Generate PKCE
  const pkceBytes = crypto.randomBytes(64).toString("base64url").slice(0, 96)
  const challenge = crypto
    .createHash("sha256")
    .update(pkceBytes)
    .digest("base64url")
  const state = crypto.randomBytes(16).toString("hex")

  const url = `${endpoints.portal.replace(/\/+$/, "")}/oauth/code`

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      response_type: "code",
      client_id: MINIMAX.OAUTH.CLIENT_ID,
      scope: MINIMAX.OAUTH.SCOPE,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
    }).toString(),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown")
    return c.json({ error: `Failed to initiate OAuth: ${text}` }, 502)
  }

  const data = await response.json()

  // CSRF check
  if (data.state !== state) {
    return c.json({ error: "State mismatch (possible CSRF)" }, 400)
  }

  const sessionId = crypto.randomUUID()
  sessions.set(sessionId, { verifier: pkceBytes, challenge, state, region })

  return c.json({
    session_id: sessionId,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    expired_in: data.expired_in,
    interval: data.interval,
    portal: endpoints.portal,
  })
})

/**
 * POST /minimax/auth/poll
 * Poll for token after the user approves the code.
 * Body: { session_id: string, user_code: string, expired_in: number, interval?: number }
 */
minimaxAuthRoute.post("/minimax/auth/poll", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { session_id, user_code, expired_in, interval } = body

  if (!session_id || !sessions.has(session_id)) {
    return c.json({ error: "Invalid or expired session" }, 400)
  }

  const session = sessions.get(session_id)!
  const endpoints = session.region === "cn" ? MINIMAX.ENDPOINTS.cn : MINIMAX.ENDPOINTS.global

  try {
    const tokenData = await pollForToken(
      endpoints.portal,
      user_code,
      session.verifier,
      Number(expired_in ?? 300),
      Number(interval ?? 2000),
    )

    const st = buildAuthState(session.region, tokenData)

    // Clean up session after successful auth
    sessions.delete(session_id)

    return c.json({
      status: "success",
      auth_state: st,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return c.json({ status: "pending", message }, 202)
  }
})

/**
 * POST /minimax/auth/refresh
 * Refresh an OAuth token.
 * Body: { auth_state: AuthState }
 */
minimaxAuthRoute.post("/minimax/auth/refresh", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const st = body.auth_state

  if (!st) {
    return c.json({ error: "auth_state is required" }, 400)
  }

  try {
    const refreshed = await refreshTokens(st)
    return c.json({
      status: "success",
      auth_state: refreshed,
    })
  } catch (err) {
    const isTerminal = err instanceof Error && "reloginRequired" in err
    return c.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : "Refresh failed",
        relogin_required: isTerminal,
      },
      401,
    )
  }
})

/**
 * GET /minimax/auth/status
 * Dummy status endpoint — real status requires a stored auth state.
 */
minimaxAuthRoute.get("/minimax/auth/status", (c) => {
  return c.json({
    logged_in: false,
    provider: "minimax-oauth",
    note: "Status requires stored AuthState. POST /minimax/auth/init to start login.",
  })
})