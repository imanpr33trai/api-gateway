# OpenCode Zen API Key + Models Provider

**Project:** `/home/imanpr33t/Documents/api-gateway/`
**Goal:** Add OpenCode Zenith as an API-key provider and serve its models
to the frontend.

---

## Step 1 — Add provider profile

**File:** `src/providers/profiles.ts` (exists, add to it)

Open the file and look at how existing providers are defined. There will be
something like a `PROVIDER_REGISTRY` object or individual `provider()`
calls. Find the pattern and add an entry for OpenCode Zenith.

**Logic to think about:**

At minimum you need:
- `name` — internal ID, probably `"opencode-zen"`
- `displayName` — shown in UI, `"OpenCode Zenith"`
- `authType` — `"api_key"` (it's just a static key, no OAuth)
- `apiMode` — since it's OpenAI-compatible, `"chat_completions"`
- `baseUrl` — the full API base URL (this is for chat completions, not models)
- `apiKeyEnvVar` — the env var name to check
- `defaultModel` — a model name to use when none is specified

**Hint — figure out the base URL:**

OpenCode Zenith is listed in the Hermes provider registry. Check
`/home/imanpr33t/.hermes/hermes-agent/hermes_cli/providers.py` for its
`base_url`. Also check if there's a `base_url_env_var` override.

```python
# In the Hermes Python codebase, providers have patterns like:
# ProviderConfig(
#     id="opencode-zen",
#     name="OpenCode Zenith",
#     auth_type="api_key",
#     inference_base_url="https://...",
#     api_key_env_vars=("OPENCODE_ZEN_API_KEY",),
# )
```

If you can't find it, search the Hermes docs or the opencode repo.
The API is OpenAI-compatible — same format as OpenAI's `/v1/chat/completions`
and `/v1/models`.

**How to test step 1:**
```bash
# You won't see it yet — profiles just define what's possible
grep -n "opencode" src/providers/profiles.ts
```

**Pitfalls:**
- Don't confuse `opencode-zen` with `opencode-go` — they're different providers
- The `baseUrl` is for inference, the models URL might be different
- Some providers have a separate `modelsUrl` field — check if it exists

---

## Step 2 — Detect the API key

**File:** `src/providers/registry.ts` (exists, modify)

The registry has a function that lists "available" providers. It likely checks
env vars. You need to make it also check `OPENCODE_ZEN_API_KEY`.

**Logic to think about:**

```typescript
// There will be a function like this somewhere in registry.ts:
function isProviderAvailable(provider: ProviderProfile): boolean {
  // Check if the required env vars are set
  // For api_key providers, this checks the API key env var
  // For OAuth providers, this checks if tokens are stored
}

// Or there might be a simpler pattern:
// const AVAILABLE_PROVIDERS = PROVIDER_REGISTRY.filter(p => {
//   return p.envVars.some(v => process.env[v]);
// });
```

Find which pattern the file uses. Then add the OpenCode Zenith env var to
whatever check it does.

**How env var checking works in practice:**

```typescript
// Most providers check if process.env[envVar] has a truthy value
// You can read environment variables from process.env at startup
// The check is usually: if (process.env["OPENCODE_ZEN_API_KEY"])
```

**Hint — provider-vs-env mapping:**

The `profiles.ts` file probably stores `envVars: ["OPENCODE_ZEN_API_KEY"]`
on the profile. The registry reads this list and checks each one. If so,
you just need the env var name in the profile and the registry handles
the rest automatically.

Look at the existing `envVars` or `apiKeyEnvVar` on other providers and
see if the registry already reads those fields.

**How to test step 2:**
```bash
# Set the env var temporarily and check if the provider appears
OPENCODE_ZEN_API_KEY=sk-test bun run src/index.ts &
curl http://localhost:3000/api/providers | grep -i opencode
```

---

## Step 3 — Fetch models

**File:** `src/routes/models.ts` or `src/controller/models.controller.ts`

The models endpoint fetches the available models from each provider and
returns them. You need to add OpenCode Zenith to this.

**Logic to think about:**

OpenAI-compatible models endpoints all work the same way:

```typescript
// 1. Build the URL — usually baseUrl + "/models"
//    or there might be a separate modelsUrl on the provider profile
const url = "https://api.opencode-zen.com/v1/models";

// 2. Make the request with the API key
const response = await fetch(url, {
  headers: {
    "Authorization": `Bearer ${process.env["OPENCODE_ZEN_API_KEY"]}`,
    "Content-Type": "application/json",
  },
});

// 3. Parse the response — OpenAI format is { data: [ { id, object, ... } ] }
const body = await response.json();
// body.data is an array of model objects

// 4. Map to your internal format
const models = body.data.map((m: any) => ({
  id: m.id,
  provider: "opencode-zen",
  // ... any other fields your system needs
}));
```

**Where to put this logic:**

Find the existing models fetching logic. There will be a loop over
providers or individual fetch calls for each one. Add OpenCode Zenith
in the same pattern. The structure is usually:

```
for each available provider:
  if provider has a models URL:
    fetch(provider.modelsUrl, { headers })
    parse + collect models
return all collected models
```

**How to handle errors:**

```typescript
// If the API key is wrong or the provider is down, don't crash
// Just skip that provider gracefully
try {
  const response = await fetch(url, { headers: { ... } });
  if (!response.ok) {
    console.warn("OpenCode Zen models fetch failed:", response.status);
    continue; // skip this provider
  }
  // ... parse
} catch (err) {
  console.warn("OpenCode Zen models network error:", err);
  // skip
}
```

**How to test step 3:**
```bash
# With the server running
curl http://localhost:3000/v1/models | python3 -m json.tool | grep -i opencode

# Or if there's a different models endpoint
curl http://localhost:3000/api/models | python3 -m json.tool | grep -i opencode
```

---

## Step 4 — Expose to frontend

The frontend talks to some endpoint to get models. It might be:
- `GET /v1/models` — standard OpenAI-compatible
- `GET /api/models` — custom format, per-provider

**Logic to think about:**

Find the endpoint the frontend calls by looking at:
1. `src/index.ts` — where routes are registered
2. The chat frontend code at `token_store/` or wherever it lives
3. Any `fetch('/api/models')` or `fetch('/v1/models')` call

If it's already using the existing models controller, and you added
OpenCode Zenith to that controller in step 3, it should just work.

If the frontend fetches a hardcoded list, you need to update the frontend
too. Check what models endpoint the frontend actually calls.

**How to test step 4:**
```bash
# Check the frontend's network tab or source code
grep -rn "models" /path/to/frontend/src/ --include="*.ts" --include="*.tsx"
```

---

## Step 5 — Chat completions (bonus)

If you want to actually USE the provider for chat, not just list models:

**Logic to think about:**

The chat route (`src/routes/chat.ts` or `src/controller/chat.controller.ts`)
currently routes requests to providers. It checks the `apiMode` to decide
how to format the request.

Since OpenCode Zenith is `chat_completions` mode (OpenAI-compatible), it
should already work with the existing OpenAI-compatible transport if
the routing logic checks the profile's `apiMode`.

Find where the chat route resolves the provider and see if it handles
`chat_completions` — it probably does. If so, just set `apiMode` to
`chat_completions` in the profile and it should work.

**How to test:**
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "opencode-zen/<model-name>",
    "messages": [{"role": "user", "content": "hi"}]
  }'
```

---

## Summary of files to touch

| File | What to add |
|------|-------------|
| `src/providers/profiles.ts` | OpenCode Zenith entry with name, url, env var |
| `src/providers/registry.ts` | Auto-detect from `OPENCODE_ZEN_API_KEY` env var |
| `src/routes/models.ts` or controller | Fetch models from provider's `/v1/models` with Bearer auth |
| `.env` | `OPENCODE_ZEN_API_KEY=your-key-here` |

## Things you need to figure out yourself

| Question | How to find the answer |
|----------|----------------------|
| What is OpenCode Zenith's base URL? | Check Hermes Python `providers.py`, OpenCode docs, or the opencode repo |
| Does it have a models endpoint? | Try `GET /v1/models` on the base URL (standard OpenAI pattern) |
| Does the registry auto-detect from env vars? | Read the `listProviders()` or `getAvailable()` function in registry.ts |
| Is there a separate models URL on the profile? | Check other providers in profiles.ts for a `modelsUrl` field |
| What endpoint does the frontend call? | Search the frontend code for `fetch(...models...)` |
| Should models be cached? | Some providers rate-limit — see if other providers cache results |
