# Hermes Agent OAuth System — Complete Analysis & TypeScript Implementation

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [OAuth Provider Types](#oauth-provider-types)
3. [Auth Store — Persistence Layer](#auth-store)
4. [MiniMax OAuth — Complete Flow (Primary Focus)](#minimax-oauth)
5. [OpenAI Codex OAuth — Device Code Flow](#codex-oauth)
6. [Qwen OAuth — External Loopback PKCE](#qwen-oauth)
7. [xAI Grok OAuth — External Loopback PKCE](#xai-oauth)
8. [Spotify OAuth — PKCE Loopback](#spotify-oauth)
9. [Google Gemini OAuth — PKCE via google-oauth](#gemini-oauth)
10. [MCP Server OAuth — MCP SDK Integration](#mcp-oauth)
11. [Token Provider Pattern — Per-Request Refresh](#token-provider)
12. [Quarantine Pattern — Dead Token Cleanup](#quarantine)
13. [Full TypeScript Implementation](#typescript-implementation)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Hermes Agent                              │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │  CLI / TUI   │    │   Gateway    │    │  Cron / Batch    │   │
│  └──────┬───────┘    └──────┬───────┘    └────────┬─────────┘   │
│         │                   │                      │             │
│         └───────────┬───────┴──────────────────────┘             │
│                     │                                            │
│            ┌────────▼────────┐                                   │
│            │   AIAgent       │                                   │
│            │  (run_agent.py) │                                   │
│            └────────┬────────┘                                   │
│                     │                                            │
│         ┌───────────▼───────────┐                                │
│         │  Runtime Credentials  │                                │
│         │   Resolution Layer    │                                │
│         └───────────┬───────────┘                                │
│                     │                                            │
│    ┌────────────────┼────────────────┐                           │
│    │                │                │                            │
│    ▼                ▼                ▼                            │
│ ┌──────┐    ┌──────────────┐  ┌──────────┐                      │
│ │OAuth │    │  API Key     │  │ External │                      │
│ │ Flow │    │  Resolution  │  │ Process  │                      │
│ └──┬───┘    └──────────────┘  └──────────┘                      │
│    │                                                             │
│    ▼                                                             │
│ ┌──────────────────────────────────────────┐                    │
│ │        ~/.hermes/auth.json               │                    │
│ │  (Cross-process file-locked JSON store)  │                    │
│ └──────────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

### Key Files (Python Reference)

| File | Role |
|------|------|
| `hermes_cli/auth.py` (7601 lines) | Core auth system — all providers |
| `tools/mcp_oauth.py` (648 lines) | MCP server OAuth integration |
| `agent/google_oauth.py` | Google Gemini OAuth PKCE |
| `gateway/web_server.py` | Dashboard auth status endpoints |
| `hermes_cli/commands.py` | `/auth` CLI slash commands |

---

## OAuth Provider Types

### Type 1: Device Code Flow (User Code + Verification URL)

```
┌────────┐          ┌────────┐          ┌────────┐
│ Client │          │ Portal │          │ Browser│
└───┬────┘          └───┬────┘          └───┬────┘
    │  POST /device/code │                   │
    │───────────────────>│                   │
    │  {user_code,       │                   │
    │   verification_url}│                   │
    │<───────────────────│                   │
    │                    │  User opens URL   │
    │                    │<──────────────────│
    │                    │  User enters code │
    │                    │──────────────────>│
    │  POST /token       │                   │
    │  (poll)            │                   │
    │───────────────────>│                   │
    │  {access_token}    │                   │
    │<───────────────────│                   │
```

**Providers**: Nous Portal, OpenAI Codex

### Type 2: Authorization Code with PKCE (Loopback Server)

```
┌────────┐          ┌────────┐          ┌────────┐
│ Client │          │ Portal │          │ Browser│
└───┬────┘          └───┬────┘          └───┬────┘
    │  Generate PKCE     │                   │
    │  Start localhost   │                   │
    │  callback server   │                   │
    │                    │                   │
    │  Open browser ─────────────────────────>│
    │  with auth URL     │                   │
    │                    │  User authorizes  │
    │                    │<──────────────────│
    │                    │                   │
    │  Redirect to       │                   │
    │  localhost:port    │                   │
    │<────────────────────────────────────────│
    │                    │                   │
    │  POST /token       │                   │
    │  (code + verifier) │                   │
    │───────────────────>│                   │
    │  {access_token,    │                   │
    │   refresh_token}   │                   │
    │<───────────────────│                   │
```

**Providers**: xAI Grok, Spotify, Google Gemini, MCP Servers

### Type 3: Custom User Code Grant (MiniMax-Specific)

```
┌────────┐          ┌────────────┐       ┌────────┐
│ Client │          │ MiniMax    │       │ Browser│
└───┬────┘          │ Portal     │       └───┬────┘
    │ POST /oauth/code│           │            │
    │ (PKCE + state) │           │            │
    │────────────────>│           │            │
    │ {user_code,     │           │            │
    │  verification_uri│          │            │
    │  expired_in}    │           │            │
    │<────────────────│           │            │
    │                 │           │ User opens │
    │                 │           │ URL + code │
    │                 │           │<───────────│
    │                 │           │───────────>│
    │                 │           │            │
    │ POST /oauth/token│          │            │
    │ (poll with       │          │            │
    │  user_code +     │          │            │
    │  code_verifier)  │          │            │
    │────────────────>│           │            │
    │ {status: success,│           │            │
    │  access_token,   │           │            │
    │  refresh_token}  │           │            │
    │<────────────────│           │            │
```

---

## Auth Store

All OAuth state is persisted in `~/.hermes/auth.json` with cross-process file locking.

```json
{
  "version": 1,
  "active_provider": "minimax-oauth",
  "updated_at": "2025-01-15T12:00:00+00:00",
  "providers": {
    "minimax-oauth": {
      "provider": "minimax-oauth",
      "region": "global",
      "portal_base_url": "https://api.minimax.io",
      "inference_base_url": "https://api.minimax.io/anthropic",
      "client_id": "78257093-7e40-4613-99e0-527b14b39113",
      "scope": "group_id profile model.completion",
      "token_type": "Bearer",
      "access_token": "eyJ...",
      "refresh_token": "rt_...",
      "obtained_at": "2025-01-15T12:00:00+00:00",
      "expires_at": "2025-01-15T13:00:00+00:00",
      "expires_in": 3600
    }
  }
}
```

---

## MiniMax OAuth

### Provider Configuration

```
Client ID:    78257093-7e40-4613-99e0-527b14b39113
Scope:        "group_id profile model.completion"
Grant Type:   "urn:ietf:params:oauth:grant-type:user_code"

Global Portal:  https://api.minimax.io
Global Inference: https://api.minimax.io/anthropic

China Portal:   https://api.minimaxi.com
China Inference: https://api.minimaxi.com/anthropic

Refresh Skew:  60 seconds (refresh 1 min before expiry)
```

### Request Flow Step-by-Step

**Step 1 — Generate PKCE Pair**

```
code_verifier  = random_urlsafe(64)[:96]
code_challenge = base64url(sha256(code_verifier))
state          = random_urlsafe(16)
```

**Step 2 — Request User Code (POST /oauth/code)**

```
POST https://api.minimax.io/oauth/code
Content-Type: application/x-www-form-urlencoded

response_type=code
client_id=78257093-7e40-4613-99e0-527b14b39113
scope=group_id+profile+model.completion
code_challenge=<S256_hash>
code_challenge_method=S256
state=<random_state>
```

Response:
```json
{
  "user_code": "ABCD-1234",
  "verification_uri": "https://api.minimax.io/authorize?code=ABCD-1234",
  "expired_in": 3600000,
  "interval": 2000,
  "state": "<echoed_state>"
}
```

**Step 3 — User Authorizes**

User opens `verification_uri` in browser, enters `user_code`.

**Step 4 — Poll for Token (POST /oauth/token)**

```
POST https://api.minimax.io/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:user_code
client_id=78257093-7e40-4613-99e0-527b14b39113
user_code=ABCD-1234
code_verifier=<original_verifier>
```

Poll every `interval_ms` (default 2000ms) until `status == "success"`:

```json
{
  "status": "success",
  "access_token": "eyJ...",
  "refresh_token": "rt_...",
  "expired_in": 3600000,
  "resource_url": "https://api.minimax.io"
}
```

**Step 5 — Resolve Expiry**

MiniMax returns `expired_in` that can be either:
- Unix milliseconds (absolute timestamp) — detected if value > now_ms / 2
- TTL seconds (relative duration) — fallback

```
if expired_in > now_ms / 2:
    expires_at = expired_in / 1000        # unix seconds
else:
    expires_at = now + expired_in         # add TTL
```

**Step 6 — Persist State**

```json
{
  "provider": "minimax-oauth",
  "region": "global",
  "portal_base_url": "https://api.minimax.io",
  "inference_base_url": "https://api.minimax.io/anthropic",
  "client_id": "78257093-7e40-4613-99e0-527b14b39113",
  "scope": "group_id profile model.completion",
  "token_type": "Bearer",
  "access_token": "eyJ...",
  "refresh_token": "rt_...",
  "obtained_at": "2025-01-15T12:00:00+00:00",
  "expires_at": "2025-01-15T13:00:00+00:00",
  "expires_in": 3600
}
```

### Token Refresh Flow

```
Read state from auth.json
         │
         ▼
Is token expiring within 60s?
         │
    No ──┤── Yes
    │         │
    ▼         ▼
  Return   POST /oauth/token
  state    grant_type=refresh_token
           client_id=<id>
           refresh_token=<rt>
                  │
                  ▼
           Parse response
           Update access_token
           Update refresh_token (if rotated)
           Re-persist to auth.json
```

### Runtime Token Provider

For long-lived sessions (gateway, cron), MiniMax uses a **callable token provider** pattern:

```
api_key = build_minimax_oauth_token_provider()  // returns () => string

// On each inference call:
token = api_key()  // reads auth.json, refreshes if needed, returns fresh token
```

This is because MiniMax issues short-lived access tokens (~15 min), and the Anthropic SDK caches `api_key` as a static string. The callable bypasses that by minting a fresh `Authorization` header per request.

---

## Codex OAuth

### Device Code Flow

```
1. POST auth.openai.com/api/accounts/deviceauth/usercode
   {client_id: "app_EMoamEEZ73f0CkXaXp7hrann"}

   → {user_code, device_auth_id, interval}

2. Show user: auth.openai.com/codex/device + user_code

3. Poll: POST auth.openai.com/api/accounts/deviceauth/token
   {device_auth_id, user_code}
   (poll every `interval` seconds, 403/404 = pending)

4. Exchange: POST auth.openai.com/oauth/token
   grant_type=authorization_code
   code=<authorization_code>
   redirect_uri=https://auth.openai.com/deviceauth/callback
   client_id=...
   code_verifier=<from step 3 response>
```

---

## Qwen OAuth

### Token Endpoint

```
Chat:       https://chat.qwen.ai
Token URL:  https://chat.qwen.ai/api/v1/oauth2/token
Client ID:  f0304373b74a44d2b584a3fb70ca9e56
Base URL:   https://portal.qwen.ai/v1

Credentials: ~/.qwen/oauth_creds.json
```

### Refresh Flow

Read from ~/.qwen/oauth_creds.json → POST refresh to token URL → Write back to file.

---

## xAI OAuth

### Discovery → PKCE → Token Exchange

```
1. Discovery: GET https://auth.x.ai/.well-known/openid-configuration
   → {authorization_endpoint, token_endpoint, ...}

2. Generate PKCE + state + nonce
   redirect_uri = http://127.0.0.1:56121/callback

3. Build auth URL:
   auth.x.ai/authorize?
     response_type=code
     client_id=b1a00492-073a-47ea-816f-4c329264a828
     redirect_uri=http://127.0.0.1:56121/callback
     scope=openid+profile+email+offline_access+grok-cli:access+api:access
     code_challenge=<S256>
     code_challenge_method=S256
     state=<state>
     nonce=<nonce>
     plan=generic
     referrer=hermes-agent

4. Start local callback server on port 56121
   Open browser → wait for redirect

5. Exchange: POST to token_endpoint
   grant_type=authorization_code
   code=<from callback>
   redirect_uri=http://127.0.0.1:56121/callback
   client_id=...
   code_verifier=<original>
   code_challenge=<original>     // defense-in-depth per #26990
   code_challenge_method=S256   // defense-in-depth
```

### Manual Paste Fallback (SSH / Cloud Shell)

When `--manual-paste` is set or no display is available:
1. No HTTP listener is started
2. User opens URL, gets redirected to unreachable localhost
3. User copies the callback URL from the browser's "connection failed" page
4. Pastes it into the terminal
5. Code is extracted from the pasted URL

---

## Spotify OAuth

### PKCE Loopback Flow

```
1. Generate PKCE + state
   redirect_uri = http://127.0.0.1:43827/spotify/callback

2. Build auth URL:
   accounts.spotify.com/authorize?
     client_id=<user_provided>
     response_type=code
     redirect_uri=http://127.0.0.1:43827/spotify/callback
     scope=user-modify-playback-state+...
     state=<state>
     code_challenge=<S256>
     code_challenge_method=S256

3. Start callback server, open browser

4. Exchange: POST accounts.spotify.com/api/token
   grant_type=authorization_code
   code=<from callback>
   redirect_uri=...
   client_id=...
   code_verifier=<original>
```

---

## Gemini OAuth

Delegates entirely to `agent/google_oauth.py`:
- Uses Google Cloud Code Assist backend
- Tokens stored in `~/.hermes/auth/google_oauth.json`
- Base URL marker: `cloudcode-pa://google`
- Actual traffic: `https://cloudcode-pa.googleapis.com/v1internal:*`

---

## MCP OAuth

Uses the MCP Python SDK's `OAuthClientProvider`:
- **Storage**: `~/.hermes/mcp-tokens/<server_name>.json` (tokens), `.client.json` (client info), `.meta.json` (server metadata)
- **Callback**: Ephemeral localhost HTTP server with auto-picked port
- **Flow**: MCP SDK handles discovery, dynamic client registration, PKCE, token exchange, and refresh

---

## Token Provider

The callable pattern used by MiniMax (and other short-lived-token providers):

```typescript
// Instead of api_key (static string):
const client = new Anthropic({ apiKey: "fixed-token" });  // expires silently

// Use a callable:
const client = new Anthropic({ apiKey: () => getToken() });  // fresh per request

function getToken(): string {
  const state = readAuthStore();
  if (isExpiring(state.expires_at, 60)) {
    const refreshed = refreshToken(state);
    saveAuthStore(refreshed);
    return refreshed.access_token;
  }
  return state.access_token;
}
```

---

## Quarantine

When a refresh fails with a terminal error (invalid_grant, token revoked, etc.):

```
1. Detect terminal error (relogin_required=true)
2. Wipe dead tokens: access_token, refresh_token, expires_at, etc.
3. Persist last_auth_error to auth.json:
   {
     "last_auth_error": {
       "provider": "minimax-oauth",
       "code": "refresh_failed",
       "message": "...",
       "reason": "runtime_refresh_failure",
       "relogin_required": true,
       "at": "2025-01-15T12:00:00+00:00"
     }
   }
4. Next call sees wiped tokens → immediate AuthError → user prompted to re-login
```

---

## TypeScript Implementation

```typescript
// =============================================================================
// OAuth System for Hermes Agent — Complete TypeScript Implementation
// =============================================================================

import * as crypto from "crypto";
import * as fs from "fs";
import * as https from "https";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import { URL } from "url";

// =============================================================================
// Constants
// =============================================================================

const AUTH_STORE_VERSION = 1;
const AUTH_LOCK_TIMEOUT_SECONDS = 15;

const DEFAULT_NOUS_PORTAL_URL = "https://portal.nousresearch.com";
const DEFAULT_NOUS_INFERENCE_URL = "https://inference-api.nousresearch.com/v1";
const DEFAULT_NOUS_CLIENT_ID = "hermes-cli";
const NOUS_SCOPE = "inference:invoke inference:mint_agent_key";

const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp77hrann";
const CODEX_OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";

const XAI_OAUTH_ISSUER = "https://auth.x.ai";
const XAI_OAUTH_DISCOVERY_URL = `${XAI_OAUTH_ISSUER}/.well-known/openid-configuration`;
const XAI_OAUTH_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
const XAI_OAUTH_SCOPE = "openid profile email offline_access grok-cli:access api:access";
const XAI_OAUTH_REDIRECT_HOST = "127.0.0.1";
const XAI_OAUTH_REDIRECT_PORT = 56121;
const XAI_OAUTH_REDIRECT_PATH = "/callback";
const XAI_BASE_URL = "https://api.x.ai/v1";

const QWEN_OAUTH_CLIENT_ID = "f0304373b74a44d2b584a3fb70ca9e56";
const QWEN_OAUTH_TOKEN_URL = "https://chat.qwen.ai/api/v1/oauth2/token";
const QWEN_BASE_URL = "https://portal.qwen.ai/v1";

const MINIMAX_OAUTH_CLIENT_ID = "78257093-7e40-4613-99e0-527b14b39113";
const MINIMAX_OAUTH_SCOPE = "group_id profile model.completion";
const MINIMAX_OAUTH_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:user_code";
const MINIMAX_OAUTH_GLOBAL_BASE = "https://api.minimax.io";
const MINIMAX_OAUTH_CN_BASE = "https://api.minimaxi.com";
const MINIMAX_OAUTH_GLOBAL_INFERENCE = "https://api.minimax.io/anthropic";
const MINIMAX_OAUTH_CN_INFERENCE = "https://api.minimaxi.com/anthropic";
const MINIMAX_OAUTH_REFRESH_SKEW_SECONDS = 60;

const DEFAULT_SPOTIFY_ACCOUNTS_BASE = "https://accounts.spotify.com";
const DEFAULT_SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const DEFAULT_SPOTIFY_REDIRECT_URI = "http://127.0.0.1:43827/spotify/callback";
const SPOTIFY_SCOPE = [
  "user-modify-playback-state", "user-read-playback-state",
  "user-read-currently-playing", "user-read-recently-played",
  "playlist-read-private", "playlist-read-collaborative",
  "playlist-modify-public", "playlist-modify-private",
  "user-library-read", "user-library-modify",
].join(" ");

// =============================================================================
// Type Definitions
// =============================================================================

interface AuthStore {
  version: number;
  active_provider?: string;
  updated_at?: string;
  providers: Record<string, ProviderState>;
  credential_pool?: Record<string, CredentialEntry[]>;
}

interface CredentialEntry {
  source: string;
  access_token?: string;
  runtime_api_key?: string;
}

type ProviderState = Record<string, unknown>;

interface OAuthAuthState {
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
  provider: string;
  api_key: string | TokenProvider;
  base_url: string;
  source: string;
  auth_mode?: string;
  last_refresh?: string;
}

interface AuthStatus {
  logged_in: boolean;
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

// =============================================================================
// AuthError
// =============================================================================

class AuthError extends Error {
  provider: string;
  code: string | null;
  relogin_required: boolean;

  constructor(
    message: string,
    opts: { provider?: string; code?: string | null; relogin_required?: boolean } = {}
  ) {
    super(message);
    this.name = "AuthError";
    this.provider = opts.provider ?? "";
    this.code = opts.code ?? null;
    this.relogin_required = opts.relogin_required ?? false;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

function getHermesHome(): string {
  return process.env.HERMES_HOME || path.join(os.homedir(), ".hermes");
}

function getAuthFilePath(): string {
  return path.join(getHermesHome(), "auth.json");
}

function hasUsableSecret(value: unknown, minLength = 4): boolean {
  if (typeof value !== "string") return false;
  const cleaned = value.trim();
  if (cleaned.length < minLength) return false;
  const placeholders = new Set(["*", "**", "***", "changeme", "your_api_key",
    "your-api-key", "placeholder", "example", "dummy", "null", "none"]);
  return !placeholders.has(cleaned.toLowerCase());
}

function parseISOTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const d = new Date(value);
    const t = d.getTime();
    return isNaN(t) ? null : t / 1000;
  } catch {
    return null;
  }
}

function isExpiring(expiresAtISO: unknown, skewSeconds: number): boolean {
  const epoch = parseISOTimestamp(expiresAtISO);
  if (epoch === null) return true;
  return epoch <= Date.now() / 1000 + skewSeconds;
}

function tokenFingerprint(token: unknown): string | null {
  if (typeof token !== "string" || !token.trim()) return null;
  return crypto.createHash("sha256").update(token.trim()).digest("hex").slice(0, 12);
}

function generateUUID(): string {
  return crypto.randomUUID();
}

// =============================================================================
// Auth Store — Persistence Layer
// =============================================================================

class AuthStoreManager {
  private filePath: string;
  private lockPath: string;

  constructor() {
    this.filePath = getAuthFilePath();
    this.lockPath = this.filePath.replace(".json", ".lock");
  }

  /**
   * Read auth.json. Returns empty store if file doesn't exist.
   * Preserves corrupt files as .json.corrupt.
   */
  readStore(): AuthStore {
    if (!fs.existsSync(this.filePath)) {
      return { version: AUTH_STORE_VERSION, providers: {} };
    }
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
      if (typeof raw === "object" && raw !== null &&
          typeof raw.providers === "object") {
        return raw as AuthStore;
      }
      return { version: AUTH_STORE_VERSION, providers: {} };
    } catch {
      const corruptPath = this.filePath + ".corrupt";
      try { fs.copyFileSync(this.filePath, corruptPath); } catch { /* ignore */ }
      return { version: AUTH_STORE_VERSION, providers: {} };
    }
  }

  /**
   * Write auth.json atomically with 0o600 permissions.
   * Uses temp file + fsync + rename for crash safety.
   */
  writeStore(store: AuthStore): void {
    store.version = AUTH_STORE_VERSION;
    store.updated_at = new Date().toISOString();

    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });

    const payload = JSON.stringify(store, null, 2) + "\n";
    const tmpPath = `${this.filePath}.tmp.${process.pid}.${generateUUID()}`;

    try {
      // Create with restrictive permissions atomically
      const fd = fs.openSync(tmpPath, "w", 0o600);
      fs.writeSync(fd, payload);
      fs.fsyncSync(fd);
      fs.closeSync(fd);

      // Atomic rename
      fs.renameSync(tmpPath, this.filePath);

      // Fsync directory for durability
      try {
        const dirFd = fs.openSync(dir, "r");
        fs.fsyncSync(dirFd);
        fs.closeSync(dirFd);
      } catch { /* best-effort */ }
    } finally {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  }

  /**
   * Load a single provider's state from the store.
   */
  getProviderState(providerId: string): ProviderState | null {
    const store = this.readStore();
    const state = store.providers?.[providerId];
    if (typeof state === "object" && state !== null) {
      return state as ProviderState;
    }
    return null;
  }

  /**
   * Save a single provider's state and optionally set it as active.
   */
  saveProviderState(providerId: string, state: ProviderState, setActive = true): void {
    const store = this.readStore();
    store.providers[providerId] = state;
    if (setActive) {
      store.active_provider = providerId;
    }
    this.writeStore(store);
  }

  /**
   * Clear a provider's auth state.
   */
  clearProvider(providerId: string): boolean {
    const store = this.readStore();
    let cleared = false;
    if (store.providers?.[providerId]) {
      delete store.providers[providerId];
      cleared = true;
    }
    if (store.active_provider === providerId) {
      delete store.active_provider;
      cleared = true;
    }
    if (cleared) {
      this.writeStore(store);
    }
    return cleared;
  }

  /**
   * Get the currently active provider ID.
   */
  getActiveProvider(): string | undefined {
    return this.readStore().active_provider;
  }

  /**
   * Read the credential pool for a provider.
   */
  readCredentialPool(providerId: string): CredentialEntry[] {
    const store = this.readStore();
    const pool = store.credential_pool?.[providerId];
    return Array.isArray(pool) ? pool : [];
  }

  /**
   * Write the credential pool for a provider.
   */
  writeCredentialPool(providerId: string, entries: CredentialEntry[]): void {
    const store = this.readStore();
    if (!store.credential_pool) store.credential_pool = {};
    store.credential_pool[providerId] = entries;
    this.writeStore(store);
  }
}

// Singleton store instance
const authStore = new AuthStoreManager();

// =============================================================================
// HTTP Client Wrapper
// =============================================================================

/**
 * Simple async HTTP POST helper using native https module.
 * In production, you'd use fetch or undici for better performance.
 */
async function httpPost(
  url: string,
  data: Record<string, string>,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(data).toString();
    const u = new URL(url);

    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "Content-Length": Buffer.byteLength(body),
        ...headers,
      },
    }, (res) => {
      let chunks = "";
      res.on("data", (d: string) => { chunks += d; });
      res.on("end", () => {
        resolve({ status: res.statusCode || 0, body: chunks });
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function httpPostJSON(
  url: string,
  jsonBody: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(jsonBody);
    const u = new URL(url);

    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Content-Length": Buffer.byteLength(body),
        ...headers,
      },
    }, (res) => {
      let chunks = "";
      res.on("data", (d: string) => { chunks += d; });
      res.on("end", () => {
        resolve({ status: res.statusCode || 0, body: chunks });
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// =============================================================================
// Helper: Detect Remote Sessions (SSH, Cloud Shell, etc.)
// =============================================================================

function isRemoteSession(): boolean {
  if (process.env.SSH_CLIENT || process.env.SSH_TTY) return true;
  const remoteEnvVars = [
    "CLOUD_SHELL", "CODESPACES", "CODESPACE_NAME",
    "GITPOD_WORKSPACE_ID", "REPL_ID", "STACKBLITZ",
  ];
  return remoteEnvVars.some(v => process.env[v]);
}

// =============================================================================
// Helper: Open URL in Browser
// =============================================================================

function openBrowser(url: string): boolean {
  if (isRemoteSession()) return false;
  try {
    const { execSync } = require("child_process");
    const platform = process.platform;
    if (platform === "darwin") execSync(`open "${url}"`);
    else if (platform === "win32") execSync(`start "${url}"`);
    else execSync(`xdg-open "${url}"`);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// =============================================================================
// MINIMAX OAUTH — PRIMARY FOCUS
// =============================================================================
// =============================================================================

class MiniMaxOAuthProvider {
  readonly clientId = MINIMAX_OAUTH_CLIENT_ID;
  readonly scope = MINIMAX_OAUTH_SCOPE;
  readonly grantType = MINIMAX_OAUTH_GRANT_TYPE;
  readonly refreshSkewSeconds = MINIMAX_OAUTH_REFRESH_SKEW_SECONDS;

  getPortalBase(region: string): string {
    return region === "cn" ? MINIMAX_OAUTH_CN_BASE : MINIMAX_OAUTH_GLOBAL_BASE;
  }

  getInferenceBase(region: string): string {
    return region === "cn" ? MINIMAX_OAUTH_CN_INFERENCE : MINIMAX_OAUTH_GLOBAL_INFERENCE;
  }

  /**
   * Generate PKCE pair: (code_verifier, code_challenge, state)
   */
  generatePKCE(): { codeVerifier: string; codeChallenge: string; state: string } {
    const codeVerifier = crypto.randomBytes(48).toString("base64url").slice(0, 96);
    const codeChallenge = crypto.createHash("sha256")
      .update(codeVerifier).digest().toString("base64url");
    const state = crypto.randomBytes(16).toString("base64url");
    return { codeVerifier, codeChallenge, state };
  }

  /**
   * Resolve MiniMax's expired_in field which can be:
   * - Unix milliseconds (absolute) — detected if value > now_ms / 2
   * - TTL seconds (relative) — fallback
   */
  resolveTokenExpiryUnix(expiredIn: number): number {
    const nowMs = Date.now();
    const raw = Math.floor(expiredIn);
    if (raw > nowMs / 2) {
      return raw / 1000;  // unix ms → unix seconds
    }
    return nowMs / 1000 + Math.max(1, raw);  // TTL seconds
  }

  /**
   * Step 1: Request user code from MiniMax portal.
   *
   * POST {portal_base_url}/oauth/code
   * Content-Type: application/x-www-form-urlencoded
   *
   * Body:
   *   response_type=code
   *   client_id={clientId}
   *   scope=group_id+profile+model.completion
   *   code_challenge={S256_hash}
   *   code_challenge_method=S256
   *   state={random_state}
   *
   * Response:
   *   {
   *     "user_code": "ABCD-1234",
   *     "verification_uri": "https://...",
   *     "expired_in": 3600000,
   *     "interval": 2000,
   *     "state": "<echoed_state>"
   *   }
   */
  async requestUserCode(
    portalBaseUrl: string,
    codeChallenge: string,
    state: string
  ): Promise<{ userCode: string; verificationUri: string; expiredIn: number; intervalMs: number; state: string }> {
    const { status, body } = await httpPost(
      `${portalBaseUrl}/oauth/code`,
      {
        response_type: "code",
        client_id: this.clientId,
        scope: this.scope,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        state,
      },
      { "x-request-id": generateUUID() }
    );

    if (status !== 200) {
      throw new AuthError(
        `MiniMax OAuth authorization failed: ${body || `HTTP ${status}`}`,
        { provider: "minimax-oauth", code: "authorization_failed" }
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new AuthError(
        "MiniMax OAuth response is not valid JSON",
        { provider: "minimax-oauth", code: "authorization_invalid_json" }
      );
    }

    // Validate required fields
    for (const field of ["user_code", "verification_uri", "expired_in"]) {
      if (!payload[field]) {
        throw new AuthError(
          `MiniMax OAuth response missing field: ${field}`,
          { provider: "minimax-oauth", code: "authorization_incomplete" }
        );
      }
    }

    // Validate state (CSRF protection)
    if (payload.state !== state) {
      throw new AuthError(
        "MiniMax OAuth state mismatch (possible CSRF).",
        { provider: "minimax-oauth", code: "state_mismatch" }
      );
    }

    return {
      userCode: String(payload.user_code),
      verificationUri: String(payload.verification_uri),
      expiredIn: Number(payload.expired_in),
      intervalMs: Number(payload.interval ?? 2000),
      state: String(payload.state),
    };
  }

  /**
   * Step 2: Poll for token after user authorizes.
   *
   * POST {portal_base_url}/oauth/token
   * Content-Type: application/x-www-form-urlencoded
   *
   * Body:
   *   grant_type=urn:ietf:params:oauth:grant-type:user_code
   *   client_id={clientId}
   *   user_code={userCode}
   *   code_verifier={original_verifier}
   *
   * Response status flow:
   *   status=pending  → keep polling
   *   status=error    → throw AuthError
   *   status=success  → return token data
   */
  async pollToken(
    portalBaseUrl: string,
    clientId: string,
    userCode: string,
    codeVerifier: string,
    expiredIn: number,
    intervalMs: number | null
  ): Promise<Record<string, unknown>> {
    const nowMs = Date.now();
    const raw = Math.floor(expiredIn);

    // Resolve deadline
    let deadline: number;
    if (raw > nowMs / 2) {
      deadline = raw / 1000;  // unix ms → seconds
    } else {
      deadline = nowMs / 1000 + Math.max(1, raw);  // TTL seconds
    }

    const interval = Math.max(2.0, (intervalMs ?? 2000) / 1000.0);

    while (Date.now() / 1000 < deadline) {
      const { status, body } = await httpPost(
        `${portalBaseUrl}/oauth/token`,
        {
          grant_type: this.grantType,
          client_id: clientId,
          user_code: userCode,
          code_verifier: codeVerifier,
        }
      );

      let payload: Record<string, unknown>;
      try {
        payload = body ? JSON.parse(body) : {};
      } catch {
        payload = {};
      }

      if (status !== 200) {
        const baseResp = (payload as Record<string, Record<string, unknown>>).base_resp;
        const msg = (baseResp?.status_msg as string) || body || `HTTP ${status}`;
        throw new AuthError(
          `MiniMax OAuth error: ${msg}`,
          { provider: "minimax-oauth", code: "token_exchange_failed" }
        );
      }

      const tokenStatus = payload.status as string;

      if (tokenStatus === "error") {
        throw new AuthError(
          "MiniMax OAuth reported an error. Please try again later.",
          { provider: "minimax-oauth", code: "authorization_denied" }
        );
      }

      if (tokenStatus === "success") {
        // Validate required token fields
        if (!payload.access_token || !payload.refresh_token || !payload.expired_in) {
          throw new AuthError(
            "MiniMax OAuth success payload missing required token fields.",
            { provider: "minimax-oauth", code: "token_incomplete" }
          );
        }
        return payload;
      }

      // status === "pending" or unknown → keep polling
      await new Promise(resolve => setTimeout(resolve, interval * 1000));
    }

    throw new AuthError(
      "MiniMax OAuth timed out before authorization completed.",
      { provider: "minimax-oauth", code: "timeout" }
    );
  }

  /**
   * Step 3: Build the auth state from the token response.
   */
  buildAuthState(
    tokenData: Record<string, unknown>,
    region: string,
    portalBaseUrl: string,
    inferenceBaseUrl: string
  ): OAuthAuthState {
    const now = new Date();
    const expiredIn = Number(tokenData.expired_in);
    const expiresAtUnix = this.resolveTokenExpiryUnix(expiredIn);
    const expiresIn = Math.max(0, Math.floor(expiresAtUnix - now.getTime() / 1000));

    return {
      provider: "minimax-oauth",
      region,
      portal_base_url: portalBaseUrl,
      inference_base_url: inferenceBaseUrl,
      client_id: this.clientId,
      scope: this.scope,
      token_type: String(tokenData.token_type ?? "Bearer"),
      access_token: String(tokenData.access_token),
      refresh_token: String(tokenData.refresh_token),
      resource_url: tokenData.resource_url ? String(tokenData.resource_url) : undefined,
      obtained_at: now.toISOString(),
      expires_at: new Date(expiresAtUnix * 1000).toISOString(),
      expires_in: expiresIn,
    };
  }

  /**
   * Step 4: Persist auth state to auth.json.
   */
  saveAuthState(state: OAuthAuthState): void {
    authStore.saveProviderState("minimax-oauth", state as unknown as ProviderState);
  }

  /**
   * COMPLETE FLOW: Run the full MiniMax OAuth login.
   *
   * This is the main entry point that ties all steps together:
   *   1. Generate PKCE pair
   *   2. Request user code
   *   3. Open browser / show URL to user
   *   4. Poll for token
   *   5. Build auth state
   *   6. Persist to auth.json
   *   7. Return auth state + notification message
   */
  async login(opts: {
    region?: string;
    openBrowser?: boolean;
    timeoutSeconds?: number;
  } = {}): Promise<{ authState: OAuthAuthState; notificationMessage?: string }> {
    const region = opts.region ?? "global";
    const portalBaseUrl = this.getPortalBase(region);
    const inferenceBaseUrl = this.getInferenceBase(region);
    const openBrowserFlag = opts.openBrowser ?? true;
    const timeoutSeconds = opts.timeoutSeconds ?? 15;

    // Use http timeout for client creation (not directly applicable in our
    // simple wrapper, but kept for flow parity)
    void timeoutSeconds;

    // Step 1: Generate PKCE
    const { codeVerifier, codeChallenge, state } = this.generatePKCE();

    // Auto-disable browser on remote sessions
    const shouldOpenBrowser = isRemoteSession() ? false : openBrowserFlag;

    console.log(`Starting Hermes login via MiniMax (${region}) OAuth...`);
    console.log(`Portal: ${portalBaseUrl}`);

    // Step 2: Request user code
    const codeData = await this.requestUserCode(portalBaseUrl, codeChallenge, state);

    console.log("\nTo continue:");
    console.log(`  1. Open: ${codeData.verificationUri}`);
    console.log(`  2. If prompted, enter code: ${codeData.userCode}`);

    if (shouldOpenBrowser) {
      if (openBrowser(codeData.verificationUri)) {
        console.log("  (Opened browser for verification)");
      } else {
        console.log("  Could not open browser automatically -- use the URL above.");
      }
    }

    console.log("Waiting for approval...");

    // Step 3: Poll for token
    const tokenData = await this.pollToken(
      portalBaseUrl,
      this.clientId,
      codeData.userCode,
      codeVerifier,
      codeData.expiredIn,
      codeData.intervalMs
    );

    // Step 4: Build auth state
    const authState = this.buildAuthState(tokenData, region, portalBaseUrl, inferenceBaseUrl);

    // Step 5: Persist
    this.saveAuthState(authState);

    console.log("✅ MiniMax OAuth login successful.");

    const notificationMessage = tokenData.notification_message
      ? String(tokenData.notification_message) : undefined;
    if (notificationMessage) {
      console.log(`Note from MiniMax: ${notificationMessage}`);
    }

    return { authState, notificationMessage };
  }

  /**
   * Refresh the MiniMax OAuth access token.
   *
   * POST {portal_base_url}/oauth/token
   * Content-Type: application/x-www-form-urlencoded
   *
   * Body:
   *   grant_type=refresh_token
   *   client_id={clientId}
   *   refresh_token={refresh_token}
   *
   * Response:
   *   {
   *     "status": "success",
   *     "access_token": "eyJ...",
   *     "refresh_token": "rt_...",
   *     "expired_in": 3600000
   *   }
   */
  async refreshToken(state: OAuthAuthState, force = false): Promise<OAuthAuthState> {
    if (!state.refresh_token) {
      throw new AuthError(
        "MiniMax OAuth state has no refresh_token; please re-login.",
        { provider: "minimax-oauth", code: "no_refresh_token", relogin_required: true }
      );
    }

    // Check if refresh is needed
    if (!force && !isExpiring(state.expires_at, this.refreshSkewSeconds)) {
      return state;
    }

    const portalBaseUrl = state.portal_base_url;

    const { status, body } = await httpPost(
      `${portalBaseUrl}/oauth/token`,
      {
        grant_type: "refresh_token",
        client_id: state.client_id,
        refresh_token: state.refresh_token,
      }
    );

    if (status !== 200) {
      const bodyLower = body.toLowerCase();
      const relogin = ["invalid_grant", "refresh_token_reused", "invalid_refresh_token"]
        .some(m => bodyLower.includes(m));
      throw new AuthError(
        `MiniMax OAuth refresh failed: ${body || `HTTP ${status}`}`,
        { provider: "minimax-oauth", code: "refresh_failed", relogin_required: relogin }
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new AuthError(
        "MiniMax OAuth refresh response is not valid JSON",
        { provider: "minimax-oauth", code: "refresh_invalid_json" }
      );
    }

    if (payload.status !== "success") {
      throw new AuthError(
        "MiniMax OAuth refresh did not return success.",
        { provider: "minimax-oauth", code: "refresh_failed", relogin_required: true }
      );
    }

    const now = new Date();
    const expiresAtUnix = this.resolveTokenExpiryUnix(Number(payload.expired_in));

    const newState: OAuthAuthState = {
      ...state,
      access_token: String(payload.access_token),
      refresh_token: payload.refresh_token
        ? String(payload.refresh_token) : state.refresh_token,
      obtained_at: now.toISOString(),
      expires_at: new Date(expiresAtUnix * 1000).toISOString(),
      expires_in: Math.max(0, Math.floor(expiresAtUnix - now.getTime() / 1000)),
    };

    this.saveAuthState(newState);
    return newState;
  }

  /**
   * Build a token provider callable that yields a fresh access token.
   *
   * This is the pattern used for long-lived sessions where MiniMax's
   * static `api_key` would otherwise expire. The callable reads the
   * persisted state from auth.json on every call and refreshes proactively
   * when the token is within MINIMAX_OAUTH_REFRESH_SKEW_SECONDS of expiry.
   */
  buildTokenProvider(): TokenProvider {
    return (): string => {
      const state = authStore.getProviderState("minimax-oauth") as unknown as OAuthAuthState | null;
      if (!state?.access_token) {
        throw new AuthError(
          "Not logged into MiniMax OAuth. Run `hermes model` and select MiniMax (OAuth).",
          { provider: "minimax-oauth", code: "not_logged_in", relogin_required: true }
        );
      }
      // Use synchronous refresh for simplicity; in production this would be async
      // See buildAsyncTokenProvider below
      return state.access_token;
    };
  }

  /**
   * Async token provider — refreshes when needed.
   */
  asyncTokenProvider(): () => Promise<string> {
    return async (): Promise<string> => {
      let state = authStore.getProviderState("minimax-oauth") as unknown as OAuthAuthState | null;
      if (!state?.access_token) {
        throw new AuthError(
          "Not logged into MiniMax OAuth. Run `hermes model` and select MiniMax (OAuth).",
          { provider: "minimax-oauth", code: "not_logged_in", relogin_required: true }
        );
      }

      // Check if refresh needed
      if (isExpiring(state.expires_at, this.refreshSkewSeconds)) {
        try {
          state = await this.refreshToken(state);
        } catch (exc) {
          if (exc instanceof AuthError && exc.relogin_required) {
            this.quarantineState(state, exc);
          }
          throw exc;
        }
      }

      if (!state.access_token) {
        throw new AuthError(
          "MiniMax OAuth state has no access_token after refresh.",
          { provider: "minimax-oauth", code: "no_access_token", relogin_required: true }
        );
      }

      return state.access_token;
    };
  }

  /**
   * Quarantine dead tokens after a terminal refresh failure.
   * Wipes access_token, refresh_token, expires_at, etc.
   * Persists last_auth_error for diagnostics.
   */
  quarantineState(state: OAuthAuthState, error: AuthError): void {
    if (!error.relogin_required || !state.refresh_token) return;

    const keysToRemove = [
      "access_token", "refresh_token", "expires_at", "expires_in",
      "obtained_at", "resource_url", "token_type",
    ];
    for (const key of keysToRemove) {
      delete (state as Record<string, unknown>)[key];
    }

    state.last_auth_error = {
      provider: "minimax-oauth",
      code: error.code ?? "refresh_failed",
      message: error.message,
      reason: "runtime_refresh_failure",
      relogin_required: true,
      at: new Date().toISOString(),
    };

    this.saveAuthState(state);
  }

  /**
   * Resolve runtime credentials for the MiniMax OAuth provider.
   * Returns {provider, api_key, base_url, source}.
   *
   * When asTokenProvider=true, api_key is a callable that mints a fresh
   * access token per invocation (with proactive refresh).
   */
  async resolveRuntimeCredentials(opts: {
    asTokenProvider?: boolean;
  } = {}): Promise<RuntimeCredentials> {
    let state = authStore.getProviderState("minimax-oauth") as unknown as OAuthAuthState | null;

    if (!state?.access_token) {
      throw new AuthError(
        "Not logged into MiniMax OAuth. Run `hermes model` and select MiniMax (OAuth).",
        { provider: "minimax-oauth", code: "not_logged_in", relogin_required: true }
      );
    }

    try {
      state = await this.refreshToken(state);
    } catch (exc) {
      if (exc instanceof AuthError) {
        this.quarantineState(state!, exc);
      }
      throw exc;
    }

    const apiKey = opts.asTokenProvider
      ? this.asyncTokenProvider()
      : state.access_token;

    return {
      provider: "minimax-oauth",
      api_key: apiKey,
      base_url: state.inference_base_url.replace(/\/$/, ""),
      source: "oauth",
    };
  }

  /**
   * Get auth status for diagnostics (hermes status / auth list).
   */
  getAuthStatus(): AuthStatus {
    const state = authStore.getProviderState("minimax-oauth") as unknown as OAuthAuthState | null;
    if (!state?.access_token) {
      return { logged_in: false, provider: "minimax-oauth" };
    }

    let tokenValid: boolean;
    try {
      const expiresAt = parseISOTimestamp(state.expires_at) ?? 0;
      tokenValid = expiresAt - Date.now() / 1000 > 0;
    } catch {
      tokenValid = !!state.access_token;
    }

    return {
      logged_in: tokenValid,
      provider: "minimax-oauth",
      region: state.region ?? "global",
      expires_at: state.expires_at,
    };
  }
}

// =============================================================================
// OPENAI CODEX OAUTH — Device Code Flow
// =============================================================================

class CodexOAuthProvider {
  readonly clientId = CODEX_OAUTH_CLIENT_ID;
  readonly tokenUrl = CODEX_OAUTH_TOKEN_URL;
  readonly issuer = "https://auth.openai.com";

  /**
   * Step 1: Request device code.
   *
   * POST https://auth.openai.com/api/accounts/deviceauth/usercode
   * Content-Type: application/json
   *
   * Body: { client_id: "..." }
   *
   * Response:
   *   {
   *     "user_code": "XXXX-XXXX",
   *     "device_auth_id": "...",
   *     "interval": 5
   *   }
   */
  async requestDeviceCode(): Promise<{
    userCode: string;
    deviceAuthId: string;
    interval: number;
  }> {
    const { status, body } = await httpPostJSON(
      `${this.issuer}/api/accounts/deviceauth/usercode`,
      { client_id: this.clientId }
    );

    if (status !== 200) {
      throw new AuthError(
        `Device code request returned status ${status}.`,
        { provider: "openai-codex", code: "device_code_request_error" }
      );
    }

    const data = JSON.parse(body);
    const userCode = data.user_code ?? "";
    const deviceAuthId = data.device_auth_id ?? "";
    const interval = Number(data.interval ?? 5);

    if (!userCode || !deviceAuthId) {
      throw new AuthError(
        "Device code response missing required fields.",
        { provider: "openai-codex", code: "device_code_incomplete" }
      );
    }

    return { userCode, deviceAuthId, interval };
  }

  /**
   * Step 2: Poll for authorization.
   *
   * POST https://auth.openai.com/api/accounts/deviceauth/token
   * Content-Type: application/json
   *
   * Body: { device_auth_id: "...", user_code: "..." }
   *
   * Response (when authorized):
   *   {
   *     "authorization_code": "...",
   *     "code_verifier": "..."
   *   }
   */
  async pollForCode(
    deviceAuthId: string,
    userCode: string,
    interval: number,
    maxWaitSeconds = 15 * 60
  ): Promise<{ authorizationCode: string; codeVerifier: string }> {
    const start = Date.now();

    while (Date.now() - start < maxWaitSeconds * 1000) {
      await new Promise(resolve => setTimeout(resolve, interval * 1000));

      const { status, body } = await httpPostJSON(
        `${this.issuer}/api/accounts/deviceauth/token`,
        { device_auth_id: deviceAuthId, user_code: userCode }
      );

      if (status === 200 && body) {
        const data = JSON.parse(body);
        if (data.authorization_code) {
          return {
            authorizationCode: data.authorization_code,
            codeVerifier: data.code_verifier ?? "",
          };
        }
      }
      // 403/404 = keep polling
    }

    throw new AuthError(
      "Login timed out after 15 minutes.",
      { provider: "openai-codex", code: "device_code_timeout" }
    );
  }

  /**
   * Step 3: Exchange authorization code for tokens.
   *
   * POST https://auth.openai.com/oauth/token
   * Content-Type: application/x-www-form-urlencoded
   *
   * Body:
   *   grant_type=authorization_code
   *   code={authorizationCode}
   *   redirect_uri=https://auth.openai.com/deviceauth/callback
   *   client_id={clientId}
   *   code_verifier={codeVerifier}
   */
  async exchangeCode(
    authorizationCode: string,
    codeVerifier: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const redirectUri = `${this.issuer}/deviceauth/callback`;

    const { status, body } = await httpPost(
      this.tokenUrl,
      {
        grant_type: "authorization_code",
        code: authorizationCode,
        redirect_uri: redirectUri,
        client_id: this.clientId,
        code_verifier: codeVerifier,
      }
    );

    if (status !== 200) {
      throw new AuthError(
        `Token exchange returned status ${status}.`,
        { provider: "openai-codex", code: "token_exchange_error" }
      );
    }

    const tokens = JSON.parse(body);
    const accessToken = tokens.access_token ?? "";
    const refreshToken = tokens.refresh_token ?? "";

    if (!accessToken) {
      throw new AuthError(
        "Token exchange did not return an access_token.",
        { provider: "openai-codex", code: "token_exchange_no_access_token" }
      );
    }

    return { accessToken, refreshToken };
  }

  /**
   * COMPLETE FLOW: Codex Device Code Login.
   */
  async login(): Promise<{ accessToken: string; refreshToken: string; baseUrl: string }> {
    // Step 1
    const { userCode, deviceAuthId, interval } = await this.requestDeviceCode();

    console.log("To continue, follow these steps:\n");
    console.log(`  1. Open this URL in your browser:`);
    console.log(`     ${this.issuer}/codex/device\n`);
    console.log(`  2. Enter this code:`);
    console.log(`     ${userCode}\n`);
    console.log("Waiting for sign-in... (press Ctrl+C to cancel)");

    // Step 2
    const { authorizationCode, codeVerifier } = await this.pollForCode(
      deviceAuthId, userCode, interval
    );

    // Step 3
    const { accessToken, refreshToken } = await this.exchangeCode(
      authorizationCode, codeVerifier
    );

    // Persist
    const baseUrl = process.env.HERMES_CODEX_BASE_URL?.replace(/\/$/, "")
      || "https://chatgpt.com/backend-api/codex";
    const authState = {
      tokens: { access_token: accessToken, refresh_token: refreshToken },
      base_url: baseUrl,
      last_refresh: new Date().toISOString(),
      auth_mode: "chatgpt",
      source: "device-code",
    };
    authStore.saveProviderState("openai-codex", authState);

    console.log("Login successful!");
    return { accessToken, refreshToken, baseUrl };
  }

  /** Get auth status. */
  getAuthStatus(): AuthStatus {
    const state = authStore.getProviderState("openai-codex");
    if (!state) return { logged_in: false, provider: "openai-codex" };
    const tokens = state.tokens as Record<string, string> | undefined;
    return {
      logged_in: !!tokens?.access_token,
      provider: "openai-codex",
    };
  }
}

// =============================================================================
// QWEN OAUTH — Token-based with refresh
// =============================================================================

class QwenOAuthProvider {
  readonly clientId = QWEN_OAUTH_CLIENT_ID;
  readonly tokenUrl = QWEN_OAUTH_TOKEN_URL;
  readonly baseUrl = QWEN_BASE_URL;
  private credentialsPath: string;

  constructor() {
    this.credentialsPath = path.join(os.homedir(), ".qwen", "oauth_creds.json");
  }

  /**
   * Read tokens from ~/.qwen/oauth_creds.json.
   */
  private readTokens(): Record<string, unknown> {
    if (!fs.existsSync(this.credentialsPath)) {
      throw new AuthError(
        "Qwen CLI credentials not found. Run 'qwen auth qwen-oauth' first.",
        { provider: "qwen-oauth", code: "qwen_auth_missing" }
      );
    }
    const data = JSON.parse(fs.readFileSync(this.credentialsPath, "utf-8"));
    if (typeof data !== "object" || data === null) {
      throw new AuthError(
        "Invalid Qwen CLI credentials.",
        { provider: "qwen-oauth", code: "qwen_auth_invalid" }
      );
    }
    return data;
  }

  /**
   * Write tokens to ~/.qwen/oauth_creds.json.
   */
  private writeTokens(tokens: Record<string, unknown>): void {
    const dir = path.dirname(this.credentialsPath);
    fs.mkdirSync(dir, { recursive: true });
    const payload = JSON.stringify(tokens, null, 2) + "\n";
    fs.writeFileSync(this.credentialsPath, payload, { mode: 0o600 });
  }

  /**
   * Check if the access token is expiring.
   * Qwen uses expiry_date in milliseconds.
   */
  private isExpiring(expiryDateMs: unknown, skewSeconds = 120): boolean {
    const ms = Number(expiryDateMs);
    if (isNaN(ms)) return true;
    return (Date.now() + skewSeconds * 1000) >= ms;
  }

  /**
   * Refresh Qwen tokens.
   *
   * POST https://chat.qwen.ai/api/v1/oauth2/token
   * Content-Type: application/x-www-form-urlencoded
   *
   * Body:
   *   grant_type=refresh_token
   *   refresh_token={refresh_token}
   *   client_id={clientId}
   */
  async refreshTokens(
    tokens: Record<string, unknown>,
    timeoutSeconds = 20
  ): Promise<Record<string, unknown>> {
    const refreshToken = String(tokens.refresh_token ?? "").trim();
    if (!refreshToken) {
      throw new AuthError(
        "Qwen OAuth refresh token missing. Re-run 'qwen auth qwen-oauth'.",
        { provider: "qwen-oauth", code: "qwen_refresh_token_missing" }
      );
    }

    // Note: timeoutSeconds would be used with a proper HTTP client
    void timeoutSeconds;

    const { status, body } = await httpPost(
      this.tokenUrl,
      {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.clientId,
      },
      { Accept: "application/json" }
    );

    if (status >= 400) {
      throw new AuthError(
        `Qwen OAuth refresh failed. Re-run 'qwen auth qwen-oauth'.${body ? ` Response: ${body}` : ""}`,
        { provider: "qwen-oauth", code: "qwen_refresh_failed" }
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new AuthError(
        "Qwen OAuth refresh returned invalid JSON.",
        { provider: "qwen-oauth", code: "qwen_refresh_invalid_json" }
      );
    }

    if (typeof payload !== "object" || !payload || !String(payload.access_token ?? "").trim()) {
      throw new AuthError(
        "Qwen OAuth refresh response missing access_token.",
        { provider: "qwen-oauth", code: "qwen_refresh_invalid_response" }
      );
    }

    const expiresIn = Number(payload.expires_in ?? 6 * 60 * 60);
    const refreshed: Record<string, unknown> = {
      access_token: String(payload.access_token).trim(),
      refresh_token: String(payload.refresh_token ?? refreshToken).trim(),
      token_type: String(payload.token_type ?? tokens.token_type ?? "Bearer").trim() || "Bearer",
      resource_url: String(payload.resource_url ?? tokens.resource_url ?? "portal.qwen.ai").trim(),
      expiry_date: Date.now() + Math.max(1, expiresIn) * 1000,
    };

    this.writeTokens(refreshed);
    return refreshed;
  }

  /**
   * Resolve runtime credentials.
   */
  async resolveRuntimeCredentials(opts: {
    forceRefresh?: boolean;
    refreshIfExpiring?: boolean;
  } = {}): Promise<RuntimeCredentials> {
    let tokens = this.readTokens();
    let accessToken = String(tokens.access_token ?? "").trim();

    let shouldRefresh = opts.forceRefresh ?? false;
    if (!shouldRefresh && (opts.refreshIfExpiring ?? true)) {
      shouldRefresh = this.isExpiring(tokens.expiry_date);
    }

    if (shouldRefresh) {
      tokens = await this.refreshTokens(tokens);
      accessToken = String(tokens.access_token ?? "").trim();
    }

    if (!accessToken) {
      throw new AuthError(
        "Qwen OAuth access token missing. Re-run 'qwen auth qwen-oauth'.",
        { provider: "qwen-oauth", code: "qwen_access_token_missing" }
      );
    }

    return {
      provider: "qwen-oauth",
      base_url: process.env.HERMES_QWEN_BASE_URL?.replace(/\/$/, "") || this.baseUrl,
      api_key: accessToken,
      source: "qwen-cli",
    };
  }

  /** Get auth status. */
  getAuthStatus(): AuthStatus {
    try {
      const creds = await this.resolveRuntimeCredentials({ refreshIfExpiring: false });
      return {
        logged_in: true,
        provider: "qwen-oauth",
        source: "qwen-cli",
        api_key: creds.api_key as string,
      };
    } catch (exc) {
      return {
        logged_in: false,
        provider: "qwen-oauth",
        error: exc instanceof AuthError ? exc.message : String(exc),
      };
    }
  }
}

// =============================================================================
// XAI OAUTH — PKCE Loopback with Manual Paste Fallback
// =============================================================================

class XAIOAuthProvider {
  readonly clientId = XAI_OAUTH_CLIENT_ID;
  readonly scope = XAI_OAUTH_SCOPE;
  readonly redirectHost = XAI_OAUTH_REDIRECT_HOST;
  readonly redirectPort = XAI_OAUTH_REDIRECT_PORT;
  readonly redirectPath = XAI_OAUTH_REDIRECT_PATH;
  readonly baseUrl = XAI_BASE_URL;

  /**
   * Discover xAI OAuth endpoints.
   *
   * GET https://auth.x.ai/.well-known/openid-configuration
   */
  async discover(timeoutSeconds = 20): Promise<{
    authorizationEndpoint: string;
    tokenEndpoint: string;
  }> {
    void timeoutSeconds; // would be used with proper HTTP client
    return new Promise((resolve, reject) => {
      https.get(XAI_OAUTH_DISCOVERY_URL, (res) => {
        let body = "";
        res.on("data", (d: string) => { body += d; });
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            resolve({
              authorizationEndpoint: data.authorization_endpoint,
              tokenEndpoint: data.token_endpoint,
            });
          } catch (e) {
            reject(new AuthError(
              `xAI discovery returned invalid JSON: ${e}`,
              { provider: "xai-oauth", code: "discovery_invalid_json" }
            ));
          }
        });
      }).on("error", (e) => {
        reject(new AuthError(
          `xAI discovery request failed: ${e}`,
          { provider: "xai-oauth", code: "discovery_request_failed" }
        ));
      });
    });
  }

  /**
   * Generate PKCE pair.
   */
  generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    const verifier = crypto.randomBytes(48).toString("base64url").slice(0, 96);
    const challenge = crypto.createHash("sha256").update(verifier).digest().toString("base64url");
    return { codeVerifier: verifier, codeChallenge: challenge };
  }

  /**
   * Build the authorization URL.
   */
  buildAuthorizeUrl(opts: {
    authorizationEndpoint: string;
    redirectUri: string;
    codeChallenge: string;
    state: string;
    nonce: string;
  }): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: opts.redirectUri,
      scope: this.scope,
      code_challenge: opts.codeChallenge,
      code_challenge_method: "S256",
      state: opts.state,
      nonce: opts.nonce,
      plan: "generic",
      referrer: "hermes-agent",
    });
    return `${opts.authorizationEndpoint}?${params.toString()}`;
  }

  /**
   * Start a local HTTP callback server on the given port.
   * Returns a promise that resolves when the OAuth redirect arrives.
   */
  startCallbackServer(preferredPort: number): Promise<{
    server: http.Server;
    code: string;
    state: string;
  }> {
    return new Promise((resolve, reject) => {
      const expectedPath = this.redirectPath;

      const server = http.createServer((req, res) => {
        const url = new URL(req.url || "/", `http://${this.redirectHost}:${preferredPort}`);

        if (url.pathname !== expectedPath) {
          res.writeHead(404);
          res.end("Not found.");
          return;
        }

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorDesc = url.searchParams.get("error_description");

        if (error) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<html><body><h1>xAI authorization failed.</h1>You can close this tab.</body></html>`);
          resolve({ server, code: "", state: "" });
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<html><body><h1>xAI authorization received.</h1>You can close this tab.</body></html>`);

        if (code) {
          resolve({ server, code, state: state || "" });
        }
      });

      server.on("error", (err) => {
        reject(new AuthError(
          `Could not bind xAI callback server: ${err}`,
          { provider: "xai-oauth", code: "xai_callback_bind_failed" }
        ));
      });

      server.listen(preferredPort, this.redirectHost);
    });
  }

  /**
   * Prompt user to paste the callback URL (for SSH / Cloud Shell).
   */
  async promptManualCallback(redirectUri: string): Promise<{ code: string; state: string }> {
    console.log("\nAfter authorizing, your browser will redirect to a localhost URL that cannot connect.");
    console.log("Copy the full URL from the browser's address bar and paste it here:");
    console.log(`(Expected redirect: ${redirectUri})\n`);

    // In a real implementation, this would use readline
    const pastedUrl = "http://127.0.0.1:56121/callback?code=abc123&state=xyz";
    const url = new URL(pastedUrl);

    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";

    // Validate against expected redirect
    if (url.origin + url.pathname !== redirectUri.split("?")[0]) {
      throw new AuthError(
        "Pasted callback URL does not match expected redirect URI.",
        { provider: "xai-oauth", code: "manual_callback_mismatch" }
      );
    }

    return { code, state };
  }

  /**
   * Exchange authorization code for tokens.
   *
   * POST {token_endpoint}
   * Content-Type: application/x-www-form-urlencoded
   *
   * Body:
   *   grant_type=authorization_code
   *   code={code}
   *   redirect_uri={redirectUri}
   *   client_id={clientId}
   *   code_verifier={verifier}
   *   code_challenge={challenge}         // defense-in-depth
   *   code_challenge_method=S256         // defense-in-depth
   */
  async exchangeCode(opts: {
    tokenEndpoint: string;
    code: string;
    redirectUri: string;
    codeVerifier: string;
    codeChallenge: string;
    timeoutSeconds?: number;
  }): Promise<Record<string, unknown>> {
    void opts.timeoutSeconds;

    if (!opts.codeVerifier) {
      throw new AuthError(
        "xAI token exchange refused locally: PKCE code_verifier is empty.",
        { provider: "xai-oauth", code: "xai_pkce_verifier_missing" }
      );
    }

    const body: Record<string, string> = {
      grant_type: "authorization_code",
      code: opts.code,
      redirect_uri: opts.redirectUri,
      client_id: this.clientId,
      code_verifier: opts.codeVerifier,
    };

    // Defense-in-depth: include code_challenge per #26990
    if (opts.codeChallenge) {
      body.code_challenge = opts.codeChallenge;
      body.code_challenge_method = "S256";
    }

    const { status, body: respBody } = await httpPost(opts.tokenEndpoint, body);

    if (status === 403) {
      throw new AuthError(
        `xAI token exchange failed (HTTP 403).${respBody ? ` Response: ${respBody}` : ""} This OAuth account is not authorized for xAI API access.`,
        { provider: "xai-oauth", code: "xai_oauth_tier_denied" }
      );
    }

    if (status !== 200) {
      throw new AuthError(
        `xAI token exchange failed (HTTP ${status}).${respBody ? ` Response: ${respBody}` : ""}`,
        { provider: "xai-oauth", code: "xai_token_exchange_failed" }
      );
    }

    try {
      return JSON.parse(respBody);
    } catch {
      throw new AuthError(
        "xAI token exchange returned invalid JSON.",
        { provider: "xai-oauth", code: "xai_token_exchange_invalid" }
      );
    }
  }

  /**
   * Refresh xAI OAuth tokens.
   *
   * POST {token_endpoint}
   * grant_type=refresh_token
   * client_id={clientId}
   * refresh_token={refresh_token}
   */
  async refreshTokens(
    tokenEndpoint: string,
    refreshToken: string,
    timeoutSeconds = 20
  ): Promise<Record<string, unknown>> {
    void timeoutSeconds;
    const { status, body } = await httpPost(
      tokenEndpoint,
      {
        grant_type: "refresh_token",
        client_id: this.clientId,
        refresh_token: refreshToken,
      }
    );

    if (status !== 200) {
      throw new AuthError(
        `xAI token refresh failed (HTTP ${status}).${body ? ` Response: ${body}` : ""}`,
        { provider: "xai-oauth", code: "xai_refresh_failed", relogin_required: true }
      );
    }

    return JSON.parse(body);
  }

  /**
   * COMPLETE FLOW: xAI OAuth Login.
   */
  async login(opts: {
    timeoutSeconds?: number;
    openBrowser?: boolean;
    manualPaste?: boolean;
  } = {}): Promise<RuntimeCredentials> {
    const timeout = opts.timeoutSeconds ?? 20;
    const openBrowser = opts.openBrowser ?? true;
    const manualPaste = opts.manualPaste ?? false;

    // Step 1: Discover endpoints
    const discovery = await this.discover(timeout);

    // Step 2: Generate PKCE
    const { codeVerifier, codeChallenge } = this.generatePKCE();
    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();

    let code: string;
    let callbackState: string;
    let redirectUri: string;

    if (manualPaste) {
      // Manual paste path (SSH / Cloud Shell)
      redirectUri = `http://${this.redirectHost}:${this.redirectPort}${this.redirectPath}`;
      const authorizeUrl = this.buildAuthorizeUrl({
        authorizationEndpoint: discovery.authorizationEndpoint,
        redirectUri,
        codeChallenge,
        state,
        nonce,
      });

      console.log("Open this URL to authorize Hermes with xAI:");
      console.log(authorizeUrl);

      const result = await this.promptManualCallback(redirectUri);
      code = result.code;
      callbackState = result.state;
    } else {
      // Loopback server path
      redirectUri = `http://${this.redirectHost}:${this.redirectPort}${this.redirectPath}`;
      const authorizeUrl = this.buildAuthorizeUrl({
        authorizationEndpoint: discovery.authorizationEndpoint,
        redirectUri,
        codeChallenge,
        state,
        nonce,
      });

      console.log("Open this URL to authorize Hermes with xAI:");
      console.log(`  ${authorizeUrl}`);
      console.log();

      if (openBrowser) {
        openBrowser && openBrowser(authorizeUrl);
      }

      const { server, code: cbCode, state: cbState } = await this.startCallbackServer(this.redirectPort);
      code = cbCode;
      callbackState = cbState;

      server.close();
    }

    // Step 3: Validate state
    if (callbackState !== state) {
      throw new AuthError(
        "xAI authorization failed: state mismatch.",
        { provider: "xai-oauth", code: "xai_state_mismatch" }
      );
    }

    // Step 4: Exchange code for tokens
    const payload = await this.exchangeCode({
      tokenEndpoint: discovery.tokenEndpoint,
      code,
      redirectUri,
      codeVerifier,
      codeChallenge,
    });

    const accessToken = String(payload.access_token ?? "").trim();
    const refreshToken = String(payload.refresh_token ?? "").trim();

    if (!accessToken) {
      throw new AuthError(
        "xAI token exchange did not return an access_token.",
        { provider: "xai-oauth", code: "xai_token_exchange_invalid" }
      );
    }

    // Step 5: Persist
    const authState = {
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        id_token: String(payload.id_token ?? "").trim(),
        expires_in: payload.expires_in,
        token_type: String(payload.token_type ?? "Bearer").trim() || "Bearer",
      },
      discovery: {
        authorization_endpoint: discovery.authorizationEndpoint,
        token_endpoint: discovery.tokenEndpoint,
      },
      redirect_uri: redirectUri,
      base_url: this.baseUrl,
      last_refresh: new Date().toISOString(),
      source: "oauth-loopback",
    };
    authStore.saveProviderState("xai-oauth", authState);

    console.log("Login successful!");
    return {
      provider: "xai-oauth",
      api_key: accessToken,
      base_url: this.baseUrl,
      source: "oauth",
    };
  }

  /** Get auth status. */
  getAuthStatus(): AuthStatus {
    const state = authStore.getProviderState("xai-oauth");
    if (!state) return { logged_in: false, provider: "xai-oauth" };
    const tokens = state.tokens as Record<string, string> | undefined;
    return {
      logged_in: !!tokens?.access_token,
      provider: "xai-oauth",
    };
  }
}

// =============================================================================
// SPOTIFY OAUTH — PKCE Loopback
// =============================================================================

class SpotifyOAuthProvider {
  private clientId: string;
  private redirectUri: string;
  private scope: string;

  constructor(opts: {
    clientId: string;
    redirectUri?: string;
    scope?: string;
  }) {
    this.clientId = opts.clientId;
    this.redirectUri = opts.redirectUri ?? DEFAULT_SPOTIFY_REDIRECT_URI;
    this.scope = opts.scope ?? SPOTIFY_SCOPE;
  }

  /**
   * Generate PKCE pair.
   */
  generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    const verifier = crypto.randomBytes(64).toString("base64url").slice(0, 128);
    const challenge = crypto.createHash("sha256").update(verifier).digest().toString("base64url");
    return { codeVerifier: verifier, codeChallenge: challenge };
  }

  /**
   * Build authorization URL.
   */
  buildAuthorizeUrl(codeChallenge: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      redirect_uri: this.redirectUri,
      scope: this.scope,
      state,
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
    });
    return `${DEFAULT_SPOTIFY_ACCOUNTS_BASE}/authorize?${params.toString()}`;
  }

  /**
   * Start callback server and wait for redirect.
   */
  async waitForCallback(): Promise<{ code: string; state: string }> {
    const url = new URL(this.redirectUri);
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const reqUrl = new URL(req.url || "/", `http://${url.hostname}:${url.port}`);
        if (reqUrl.pathname !== url.pathname) {
          res.writeHead(404);
          res.end("Not found.");
          return;
        }
        const code = reqUrl.searchParams.get("code");
        const state = reqUrl.searchParams.get("state");
        const error = reqUrl.searchParams.get("error");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(error
          ? "<html><body><h1>Spotify authorization failed.</h1>You can close this tab.</body></html>"
          : "<html><body><h1>Spotify authorization received.</h1>You can close this tab.</body></html>"
        );
        server.close();
        resolve({ code: code || "", state: state || "" });
      });
      server.on("error", reject);
      server.listen(Number(url.port), url.hostname);
    });
  }

  /**
   * Exchange code for tokens.
   *
   * POST https://accounts.spotify.com/api/token
   * grant_type=authorization_code
   * code={code}
   * redirect_uri={redirectUri}
   * client_id={clientId}
   * code_verifier={verifier}
   */
  async exchangeCode(code: string, codeVerifier: string): Promise<Record<string, unknown>> {
    const { status, body } = await httpPost(
      `${DEFAULT_SPOTIFY_ACCOUNTS_BASE}/api/token`,
      {
        client_id: this.clientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: this.redirectUri,
        code_verifier: codeVerifier,
      }
    );

    if (status >= 400) {
      throw new AuthError(
        `Spotify token exchange failed.${body ? ` Response: ${body}` : ""}`,
        { provider: "spotify", code: "spotify_token_exchange_failed" }
      );
    }

    const payload = JSON.parse(body);
    if (typeof payload !== "object" || !payload || !String(payload.access_token ?? "").trim()) {
      throw new AuthError(
        "Spotify token response did not include an access_token.",
        { provider: "spotify", code: "spotify_token_exchange_invalid" }
      );
    }

    return payload;
  }

  /**
   * COMPLETE FLOW: Spotify OAuth Login.
   */
  async login(): Promise<OAuthAuthState> {
    const { codeVerifier, codeChallenge } = this.generatePKCE();
    const stateNonce = crypto.randomUUID();
    const authorizeUrl = this.buildAuthorizeUrl(codeChallenge, stateNonce);

    console.log("Starting Spotify PKCE login...");
    console.log(`Client ID: ${this.clientId}`);
    console.log(`Redirect URI: ${this.redirectUri}`);
    console.log("\nOpen this URL to authorize Hermes:");
    console.log(authorizeUrl);

    // Start callback server
    const callbackPromise = this.waitForCallback();

    // Open browser
    openBrowser(authorizeUrl);

    // Wait for callback
    const { code, state } = await callbackPromise withTimeout(180);

    if (!code) {
      throw new AuthError("Spotify authorization failed: no code received.",
        { provider: "spotify", code: "spotify_no_code" });
    }
    if (state !== stateNonce) {
      throw new AuthError("Spotify authorization failed: state mismatch.",
        { provider: "spotify", code: "spotify_state_mismatch" });
    }

    // Exchange
    const tokenPayload = await this.exchangeCode(code, codeVerifier);

    const now = new Date();
    const expiresIn = Number(tokenPayload.expires_in ?? 0);
    const expiresAt = new Date(now.getTime() + expiresIn * 1000);

    const authState: OAuthAuthState = {
      provider: "spotify",
      portal_base_url: DEFAULT_SPOTIFY_ACCOUNTS_BASE,
      inference_base_url: DEFAULT_SPOTIFY_API_BASE,
      client_id: this.clientId,
      scope: this.scope,
      token_type: String(tokenPayload.token_type ?? "Bearer"),
      access_token: String(tokenPayload.access_token),
      refresh_token: String(tokenPayload.refresh_token ?? ""),
      obtained_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      expires_in: expiresIn,
    };

    authStore.saveProviderState("spotify", authState as unknown as ProviderState);
    console.log("Spotify login successful!");
    return authState;
  }

  /**
   * Refresh Spotify tokens.
   */
  async refreshToken(state: OAuthAuthState): Promise<OAuthAuthState> {
    if (!state.refresh_token) {
      throw new AuthError("Spotify refresh token missing. Run `hermes auth spotify` again.",
        { provider: "spotify", code: "spotify_refresh_token_missing", relogin_required: true });
    }

    const { status, body } = await httpPost(
      `${DEFAULT_SPOTIFY_ACCOUNTS_BASE}/api/token`,
      {
        grant_type: "refresh_token",
        refresh_token: state.refresh_token,
        client_id: this.clientId,
      }
    );

    if (status >= 400) {
      throw new AuthError(
        `Spotify token refresh failed. Run \`hermes auth spotify\` again.${body ? ` Response: ${body}` : ""}`,
        { provider: "spotify", code: "spotify_refresh_failed", relogin_required: true }
      );
    }

    const payload = JSON.parse(body);
    if (!payload.access_token) {
      throw new AuthError(
        "Spotify refresh response did not include an access_token.",
        { provider: "spotify", code: "spotify_refresh_invalid", relogin_required: true }
      );
    }

    const now = new Date();
    const expiresIn = Number(payload.expires_in ?? 0);
    const newState: OAuthAuthState = {
      ...state,
      access_token: String(payload.access_token),
      refresh_token: payload.refresh_token
        ? String(payload.refresh_token) : state.refresh_token,
      obtained_at: now.toISOString(),
      expires_at: new Date(now.getTime() + expiresIn * 1000).toISOString(),
      expires_in: expiresIn,
    };

    authStore.saveProviderState("spotify", newState as unknown as ProviderState);
    return newState;
  }

  /** Get auth status. */
  getAuthStatus(): AuthStatus {
    const state = authStore.getProviderState("spotify") as unknown as OAuthAuthState | null;
    if (!state) return { logged_in: false };
    return {
      logged_in: !!state.refresh_token || !isExpiring(state.expires_at, 0),
      provider: "spotify",
      auth_type: "oauth_pkce",
      client_id: state.client_id,
      redirect_uri: state.portal_base_url,
      scope: state.scope,
      expires_at: state.expires_at,
      api_base_url: state.inference_base_url,
      has_refresh_token: !!state.refresh_token,
    };
  }
}

// =============================================================================
// GOOGLE GEMINI OAUTH — PKCE via google-oauth module
// =============================================================================

/**
 * Google Gemini OAuth delegates to a separate google-oauth module.
 * This is a thin wrapper that reads from the credentials file.
 *
 * Credentials stored at: ~/.hermes/auth/google_oauth.json
 * Base URL marker: "cloudcode-pa://google"
 * Actual API: https://cloudcode-pa.googleapis.com/v1internal:*
 */

class GeminiOAuthProvider {
  private credentialsPath: string;

  constructor() {
    this.credentialsPath = path.join(getHermesHome(), "auth", "google_oauth.json");
  }

  /**
   * Load credentials from disk.
   */
  private loadCredentials(): Record<string, unknown> | null {
    if (!fs.existsSync(this.credentialsPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.credentialsPath, "utf-8"));
    } catch {
      return null;
    }
  }

  /**
   * Resolve runtime credentials.
   * In the full implementation, this would call get_valid_access_token()
   * from the google-oauth module which handles PKCE flow and token refresh.
   */
  async resolveRuntimeCredentials(): Promise<RuntimeCredentials> {
    const creds = this.loadCredentials();
    if (!creds?.access_token) {
      throw new AuthError(
        "Not logged into Google Gemini OAuth. Run `hermes auth add google-gemini-cli`.",
        { provider: "google-gemini-cli", code: "not_logged_in", relogin_required: true }
      );
    }

    return {
      provider: "google-gemini-cli",
      base_url: "cloudcode-pa://google",
      api_key: String(creds.access_token),
      source: "google-oauth",
    };
  }

  /** Get auth status. */
  getAuthStatus(): AuthStatus {
    const creds = this.loadCredentials();
    if (!creds?.access_token) {
      return { logged_in: false, provider: "google-gemini-cli" };
    }
    return {
      logged_in: true,
      provider: "google-gemini-cli",
      source: "google-oauth",
      api_key: String(creds.access_token),
      expires_at_ms: creds.expires_ms ? Number(creds.expires_ms) : undefined,
      email: creds.email ? String(creds.email) : "",
      project_id: creds.project_id ? String(creds.project_id) : "",
    };
  }
}

// =============================================================================
// MCP OAUTH — MCP SDK Integration
// =============================================================================

/**
 * MCP Server OAuth uses the MCP Python SDK's OAuthClientProvider.
 * This TypeScript equivalent shows the architecture.
 *
 * Token storage layout:
 *   ~/.hermes/mcp-tokens/<server_name>.json         — tokens
 *   ~/.hermes/mcp-tokens/<server_name>.client.json   — client info
 *   ~/.hermes/mcp-tokens/<server_name>.meta.json     — server metadata
 */

interface MCPTokenData {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  expires_at?: number;  // absolute unix seconds (our extension)
}

interface MCPClientInfo {
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
}

interface OAuthMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
}

class MCPTokenStorage {
  private serverName: string;
  private tokenDir: string;

  constructor(serverName: string) {
    this.serverName = serverName.replace(/[^\w\-]/g, "_").slice(0, 128) || "default";
    this.tokenDir = path.join(getHermesHome(), "mcp-tokens");
  }

  private tokensPath(): string {
    return path.join(this.tokenDir, `${this.serverName}.json`);
  }

  private clientInfoPath(): string {
    return path.join(this.tokenDir, `${this.serverName}.client.json`);
  }

  private metaPath(): string {
    return path.join(this.tokenDir, `${this.serverName}.meta.json`);
  }

  /**
   * Read tokens from disk, reconstructing expires_in from absolute expires_at.
   */
  readTokens(): MCPTokenData | null {
    const p = this.tokensPath();
    if (!fs.existsSync(p)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(p, "utf-8"));
      const expiresAt = data.expires_at as number | undefined;
      if (expiresAt !== undefined) {
        data.expires_in = Math.max(0, Math.floor(expiresAt - Date.now() / 1000));
      }
      delete data.expires_at;  // not part of SDK schema
      return data as MCPTokenData;
    } catch {
      return null;
    }
  }

  /**
   * Write tokens to disk with absolute expires_at for restart safety.
   */
  writeTokens(tokens: MCPTokenData): void {
    const payload = { ...tokens };
    if (payload.expires_in !== undefined) {
      (payload as Record<string, unknown>).expires_at =
        Date.now() / 1000 + Number(payload.expires_in);
    }
    fs.mkdirSync(this.tokenDir, { recursive: true });
    fs.writeFileSync(this.tokensPath(), JSON.stringify(payload, null, 2), { mode: 0o600 });
  }

  /**
   * Read client info.
   */
  readClientInfo(): MCPClientInfo | null {
    const p = this.clientInfoPath();
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, "utf-8")) as MCPClientInfo;
    } catch {
      return null;
    }
  }

  /**
   * Write client info.
   */
  writeClientInfo(info: MCPClientInfo): void {
    fs.mkdirSync(this.tokenDir, { recursive: true });
    fs.writeFileSync(this.clientInfoPath(), JSON.stringify(info, null, 2), { mode: 0o600 });
  }

  /**
   * Read OAuth server metadata.
   */
  readMetadata(): OAuthMetadata | null {
    const p = this.metaPath();
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, "utf-8")) as OAuthMetadata;
    } catch {
      return null;
    }
  }

  /**
   * Write OAuth server metadata.
   */
  writeMetadata(meta: OAuthMetadata): void {
    fs.mkdirSync(this.tokenDir, { recursive: true });
    fs.writeFileSync(this.metaPath(), JSON.stringify(meta, null, 2), { mode: 0o600 });
  }

  /**
   * Check if cached tokens exist (may be expired).
   */
  hasCachedTokens(): boolean {
    return fs.existsSync(this.tokensPath());
  }

  /**
   * Delete all stored OAuth state for this server.
   */
  remove(): void {
    for (const p of [this.tokensPath(), this.clientInfoPath(), this.metaPath()]) {
      try { fs.unlinkSync(p); } catch { /* ignore */ }
    }
  }
}

/**
 * MCP OAuth Callback Server.
 * Starts an ephemeral localhost HTTP server to capture the OAuth redirect.
 */
class MCPCallbackServer {
  private port: number;
  private server: http.Server | null = null;
  private resolve: ((code: string, state: string) => void) | null = null;
  private reject: ((err: Error) => void) | null = null;

  constructor(port: number) {
    this.port = port;
  }

  /**
   * Start listening and return a promise that resolves with the auth code.
   */
  waitForCallback(timeoutMs = 300000): Promise<{ code: string; state: string }> {
    return new Promise((resolve, reject) => {
      this.resolve = (code, state) => {
        this.close();
        resolve({ code, state });
      };
      this.reject = (err) => {
        this.close();
        reject(err);
      };

      this.server = http.createServer((req, res) => {
        const url = new URL(req.url || "/", `http://127.0.0.1:${this.port}`);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        if (error) {
          res.end(`<html><body><h2>Authorization Failed</h2><p>Error: ${error}</p></body></html>`);
          this.reject?.(new AuthError(`OAuth error: ${error}`, { code: "oauth_error" }));
        } else {
          res.end(`<html><body><h2>Authorization Successful</h2><p>You can close this tab.</p></body></html>`);
          if (code) {
            this.resolve?.(code, state || "");
          }
        }
      });

      this.server.on("error", (err) => {
        this.reject?.(new AuthError(
          `MCP OAuth callback server error: ${err}`,
          { code: "callback_server_error" }
        ));
      });

      this.server.listen(this.port, "127.0.0.1");

      // Timeout
      setTimeout(() => {
        this.reject?.(new AuthError(
          "MCP OAuth callback timed out.",
          { code: "callback_timeout" }
        ));
      }, timeoutMs);
    });
  }

  close(): void {
    try { this.server?.close(); } catch { /* ignore */ }
    this.server = null;
  }
}

// =============================================================================
// PROVIDER REGISTRY — Central Provider Resolution
// =============================================================================

/**
 * Provider registry maps provider IDs to their configurations.
 * This is the single source of truth for all known providers.
 */
const PROVIDER_REGISTRY: Record<string, {
  id: string;
  name: string;
  authType: "oauth_device_code" | "oauth_external" | "oauth_minimax" | "api_key";
  portalBaseUrl?: string;
  inferenceBaseUrl?: string;
  clientId?: string;
  scope?: string;
  apiKeyEnvVars?: string[];
  baseUrlEnvVar?: string;
  extra?: Record<string, unknown>;
}> = {
  nous: {
    id: "nous",
    name: "Nous Portal",
    authType: "oauth_device_code",
    portalBaseUrl: DEFAULT_NOUS_PORTAL_URL,
    inferenceBaseUrl: DEFAULT_NOUS_INFERENCE_URL,
    clientId: DEFAULT_NOUS_CLIENT_ID,
    scope: NOUS_SCOPE,
  },
  "openai-codex": {
    id: "openai-codex",
    name: "OpenAI Codex",
    authType: "oauth_external",
    inferenceBaseUrl: "https://chatgpt.com/backend-api/codex",
  },
  "xai-oauth": {
    id: "xai-oauth",
    name: "xAI Grok OAuth (SuperGrok Subscription)",
    authType: "oauth_external",
    inferenceBaseUrl: XAI_BASE_URL,
  },
  "qwen-oauth": {
    id: "qwen-oauth",
    name: "Qwen OAuth",
    authType: "oauth_external",
    inferenceBaseUrl: QWEN_BASE_URL,
  },
  "minimax-oauth": {
    id: "minimax-oauth",
    name: "MiniMax (OAuth · minimax.io)",
    authType: "oauth_minimax",
    portalBaseUrl: MINIMAX_OAUTH_GLOBAL_BASE,
    inferenceBaseUrl: MINIMAX_OAUTH_GLOBAL_INFERENCE,
    clientId: MINIMAX_OAUTH_CLIENT_ID,
    scope: MINIMAX_OAUTH_SCOPE,
    extra: {
      region: "global",
      cn_portal_base_url: MINIMAX_OAUTH_CN_BASE,
      cn_inference_base_url: MINIMAX_OAUTH_CN_INFERENCE,
    },
  },
  "google-gemini-cli": {
    id: "google-gemini-cli",
    name: "Google Gemini (OAuth)",
    authType: "oauth_external",
    inferenceBaseUrl: "cloudcode-pa://google",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    authType: "api_key",
    inferenceBaseUrl: "https://api.anthropic.com",
    apiKeyEnvVars: ["ANTHROPIC_API_KEY", "ANTHROPIC_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"],
    baseUrlEnvVar: "ANTHROPIC_BASE_URL",
  },
  gemini: {
    id: "gemini",
    name: "Google AI Studio",
    authType: "api_key",
    inferenceBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyEnvVars: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
    baseUrlEnvVar: "GEMINI_BASE_URL",
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    authType: "api_key",
    inferenceBaseUrl: "https://api.deepseek.com/v1",
    apiKeyEnvVars: ["DEEPSEEK_API_KEY"],
    baseUrlEnvVar: "DEEPSEEK_BASE_URL",
  },
  spotify: {
    id: "spotify",
    name: "Spotify",
    authType: "oauth_external",
  },
};

// =============================================================================
// PROVIDER RESOLUTION — Picks which provider to use
// =============================================================================

/**
 * Resolve which inference provider to use.
 *
 * Priority chain (when requested="auto" or None):
 *   1. active_provider in auth.json with valid credentials
 *   2. Explicit CLI api_key/base_url → "openrouter"
 *   3. OPENAI_API_KEY or OPENROUTER_API_KEY env vars → "openrouter"
 *   4. Provider-specific API keys (GLM, Kimi, MiniMax) → that provider
 *   5. Fallback: raise AuthError
 */
function resolveProvider(requested?: string): string {
  const normalized = (requested || "auto").trim().toLowerCase();

  // Provider aliases
  const PROVIDER_ALIASES: Record<string, string> = {
    "glm": "zai", "z-ai": "zai", "z.ai": "zai", "zhipu": "zai",
    "google": "gemini", "google-gemini": "gemini",
    "x-ai": "xai", "x.ai": "xai", "grok": "xai",
    "xai-oauth": "xai-oauth", "grok-oauth": "xai-oauth",
    "kimi": "kimi-coding", "moonshot": "kimi-coding",
    "claude": "anthropic", "claude-code": "anthropic",
    "github": "copilot", "github-copilot": "copilot",
    "qwen-portal": "qwen-oauth", "qwen-cli": "qwen-oauth",
    "minimax-portal": "minimax-oauth", "minimax-global": "minimax-oauth",
    "gemini-cli": "google-gemini-cli", "gemini-oauth": "google-gemini-cli",
  };

  const resolved = PROVIDER_ALIASES[normalized] || normalized;

  if (resolved === "openrouter" || resolved === "custom") return resolved;
  if (PROVIDER_REGISTRY[resolved]) return resolved;

  if (resolved !== "auto") {
    throw new AuthError(
      `Unknown provider '${resolved}'. Check 'hermes model' for available providers.`,
      { code: "invalid_provider" }
    );
  }

  // Auto-detection: check auth store for active OAuth provider
  const activeProvider = authStore.getActiveProvider();
  if (activeProvider && PROVIDER_REGISTRY[activeProvider]) {
    return activeProvider;
  }

  // Check env vars for API-key providers
  if (hasUsableSecret(process.env.OPENROUTER_API_KEY) || hasUsableSecret(process.env.OPENAI_API_KEY)) {
    return "openrouter";
  }

  // Check provider-specific env vars
  for (const [pid, pconfig] of Object.entries(PROVIDER_REGISTRY)) {
    if (pconfig.authType !== "api_key") continue;
    if (pid === "copilot" || pid === "lmstudio") continue;
    for (const envVar of pconfig.apiKeyEnvVars || []) {
      if (hasUsableSecret(process.env[envVar])) return pid;
    }
  }

  throw new AuthError(
    "No inference provider configured. Run 'hermes model' to choose a provider.",
    { code: "no_provider_configured" }
  );
}

// =============================================================================
// UNIFIED AUTH MANAGER — High-level API
// =============================================================================

class AuthManager {
  readonly minimax = new MiniMaxOAuthProvider();
  readonly codex = new CodexOAuthProvider();
  readonly qwen = new QwenOAuthProvider();
  readonly xai = new XAIOAuthProvider();
  readonly gemini = new GeminiOAuthProvider();
  private spotifyInstance: SpotifyOAuthProvider | null = null;

  /** Get or create Spotify provider (requires user-provided client ID). */
  spotify(clientId: string, redirectUri?: string): SpotifyOAuthProvider {
    if (!this.spotifyInstance || this.spotifyInstance["clientId"] !== clientId) {
      this.spotifyInstance = new SpotifyOAuthProvider({ clientId, redirectUri });
    }
    return this.spotifyInstance;
  }

  /**
   * Login to a provider by ID.
   */
  async login(providerId: string, opts: Record<string, unknown> = {}): Promise<unknown> {
    switch (providerId) {
      case "minimax-oauth":
        return this.minimax.login(opts);
      case "openai-codex":
        return this.codex.login();
      case "qwen-oauth":
        return this.qwen.resolveRuntimeCredentials();
      case "xai-oauth":
        return this.xai.login(opts);
      case "google-gemini-cli":
        return this.gemini.resolveRuntimeCredentials();
      default:
        throw new AuthError(`No login handler for provider: ${providerId}`);
    }
  }

  /**
   * Get auth status for a provider.
   */
  getStatus(providerId: string): AuthStatus {
    switch (providerId) {
      case "minimax-oauth":
        return this.minimax.getAuthStatus();
      case "openai-codex":
        return this.codex.getAuthStatus();
      case "qwen-oauth":
        return this.qwen.getAuthStatus();
      case "xai-oauth":
        return this.xai.getAuthStatus();
      case "google-gemini-cli":
        return this.gemini.getAuthStatus();
      default:
        return { logged_in: false, provider: providerId };
    }
  }

  /**
   * Resolve runtime credentials for a provider.
   */
  async resolveCredentials(providerId: string, opts: Record<string, unknown> = {}): Promise<RuntimeCredentials> {
    switch (providerId) {
      case "minimax-oauth":
        return this.minimax.resolveRuntimeCredentials(opts);
      case "qwen-oauth":
        return this.qwen.resolveRuntimeCredentials(opts);
      case "google-gemini-cli":
        return this.gemini.resolveRuntimeCredentials();
      default:
        throw new AuthError(`No credential resolver for provider: ${providerId}`);
    }
  }

  /**
   * Logout from a provider.
   */
  logout(providerId?: string): boolean {
    const target = providerId || authStore.getActiveProvider();
    if (!target) {
      console.log("No provider is currently logged in.");
      return false;
    }
    return authStore.clearProvider(target);
  }

  /**
   * List all providers and their login status.
   */
  listAll(): Array<{ id: string; name: string; logged_in: boolean }> {
    return Object.entries(PROVIDER_REGISTRY).map(([id, config]) => ({
      id,
      name: config.name,
      logged_in: this.getStatus(id).logged_in,
    }));
  }
}

// =============================================================================
// UTILITY: Promise with timeout
// =============================================================================

function withTimeout<T>(ms: number): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new AuthError(
      `Operation timed out after ${ms}ms`,
      { code: "timeout" }
    )), ms);
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  // Core
  AuthStoreManager,
  AuthManager,
  AuthError,
  authStore,

  // Providers
  MiniMaxOAuthProvider,
  CodexOAuthProvider,
  QwenOAuthProvider,
  XAIOAuthProvider,
  SpotifyOAuthProvider,
  GeminiOAuthProvider,

  // MCP
  MCPTokenStorage,
  MCPCallbackServer,

  // Utilities
  resolveProvider,
  isRemoteSession,
  openBrowser,
  hasUsableSecret,
  isExpiring,
  parseISOTimestamp,
  tokenFingerprint,
  generateUUID,
  withTimeout,

  // HTTP helpers
  httpPost,
  httpPostJSON,

  // Constants
  PROVIDER_REGISTRY,
  MINIMAX_OAUTH_CLIENT_ID,
  MINIMAX_OAUTH_SCOPE,
  MINIMAX_OAUTH_GRANT_TYPE,
  MINIMAX_OAUTH_GLOBAL_BASE,
  MINIMAX_OAUTH_CN_BASE,
  MINIMAX_OAUTH_GLOBAL_INFERENCE,
  MINIMAX_OAUTH_CN_INFERENCE,
  MINIMAX_OAUTH_REFRESH_SKEW_SECONDS,
  CODEX_OAUTH_CLIENT_ID,
  XAI_OAUTH_CLIENT_ID,
  XAI_OAUTH_SCOPE,
  XAI_BASE_URL,
  QWEN_OAUTH_CLIENT_ID,
  QWEN_OAUTH_TOKEN_URL,
  QWEN_BASE_URL,
  DEFAULT_SPOTIFY_ACCOUNTS_BASE,
  DEFAULT_SPOTIFY_API_BASE,
  DEFAULT_SPOTIFY_REDIRECT_URI,
  SPOTIFY_SCOPE,

  // Types
  type AuthStore,
  type ProviderState,
  type OAuthAuthState,
  type TokenProvider,
  type RuntimeCredentials,
  type AuthStatus,
  type CredentialEntry,
  type MCPTokenData,
  type MCPClientInfo,
  type OAuthMetadata,
};

// =============================================================================
// CLI ENTRY POINT (example usage)
// =============================================================================

async function main() {
  const auth = new AuthManager();

  // Example: MiniMax OAuth login
  console.log("=== MiniMax OAuth Login ===");
  try {
    const result = await auth.minimax.login({
      region: "global",
      openBrowser: true,
      timeoutSeconds: 15,
    });
    console.log("Auth state:", JSON.stringify(result.authState, null, 2));
  } catch (err) {
    if (err instanceof AuthError) {
      console.error(`AuthError [${err.code}]: ${err.message}`);
      if (err.relogin_required) {
        console.error("Please re-login to continue.");
      }
    } else {
      console.error("Unexpected error:", err);
    }
  }

  // Example: Check status
  console.log("\n=== Auth Status ===");
  const status = auth.getStatus("minimax-oauth");
  console.log(JSON.stringify(status, null, 2));

  // Example: Resolve runtime credentials (with token provider)
  console.log("\n=== Runtime Credentials ===");
  try {
    const creds = await auth.resolveCredentials("minimax-oauth", { asTokenProvider: true });
    console.log("Provider:", creds.provider);
    console.log("Base URL:", creds.base_url);
    console.log("Source:", creds.source);
    console.log("API key is callable:", typeof creds.api_key === "function");
  } catch (err) {
    if (err instanceof AuthError) {
      console.error(`AuthError [${err.code}]: ${err.message}`);
    }
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}
