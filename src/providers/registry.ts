/**
 * Provider Registry — in-memory cache with DB persistence.
 *
 * Provides: getProvider, listProviders, upsertProvider, resolveApiKey,
 * fetchModels (live model listing), and provider profile management.
 */

import { eq } from 'drizzle-orm'

import { getCredentials } from '../auth/store'
import { db } from '../db'
import { providers } from '../db/schema'
// import { applyUserOverrides, mergeUserPlugins } from './plugins"
import { PROVIDER_HOOKS } from './profiles'
import type { ProviderProfile, ProviderProfileData } from './types'

// ─── In-memory cache ──────────────────────────────────────────────

let _profilesCache: Map<string, ProviderProfile> | null = null

function buildFullProfileMap(
  rows: (typeof providers.$inferSelect)[]
): Map<string, ProviderProfile> {
  const map = new Map<string, ProviderProfile>()
  for (const row of rows) {
    const profile: ProviderProfileData = {
      name: row.name,
      aliases: Array.isArray(row.aliases) ? (row.aliases as string[]) : [],
      displayName: row.displayName,
      description: row.description,
      signupUrl: row.signupUrl,
      authType: row.authType as ProviderProfileData['authType'],
      envVars: Array.isArray(row.envVars) ? (row.envVars as string[]) : [],
      baseUrl: row.baseUrl,
      modelsUrl: row.modelsUrl,
      apiMode: row.apiMode as ProviderProfileData['apiMode'],
      hostname: row.hostname ?? '',
      supportsHealthCheck: row.supportsHealthCheck ?? true,
      fallbackModels: Array.isArray(row.fallbackModels)
        ? (row.fallbackModels as string[])
        : [],
      defaultAuxModel: row.defaultAuxModel,
      fixedTemperature: row.fixedTemperature ?? null,
      defaultMaxTokens: row.defaultMaxTokens ?? null,
      defaultHeaders: (row.defaultHeaders as Record<string, string>) ?? {},
      oauthConfig: row.oauthConfig as ProviderProfileData['oauthConfig']
    }
    const hooks = PROVIDER_HOOKS[profile.name]

    // Attach hooks from built-in profiles
    const full: ProviderProfile = hooks ? { ...profile, hooks } : profile
    map.set(profile.name, full)
    for (const alias of profile.aliases) {
      map.set(alias, full)
    }
  }
  return map
}

// ─── Cache lifecycle ──────────────────────────────────────────────

export async function ensureProfilesLoaded(): Promise<void> {
  if (_profilesCache !== null) return
  try {
    const rows = await db.select().from(providers)

    // Build map from DB + attach built-in hooks
    const baseMap = buildFullProfileMap(rows)

    // Merge user plugins (JSON) — overrides on name collision
    const withPlugins = mergeUserPlugins(baseMap)

    // Apply user overrides file (~/.config/ts-provider-oauth/user-profiles.json)
    const finalMap = applyUserOverrides(withPlugins)

    _profilesCache = finalMap
  } catch {
    // DB not available — cache stays null; getProvider/listProviders will return empty
    _profilesCache = new Map()
  }
}

export function invalidateProfilesCache(): void {
  _profilesCache = null
}

// ─── Read operations ──────────────────────────────────────────────

export async function getProvider(
  name: string
): Promise<ProviderProfile | null> {
  await ensureProfilesLoaded()
  if (!_profilesCache) return null

  // Try exact match first
  const exact = _profilesCache.get(name)
  if (exact) return exact

  // Try case-insensitive match
  const lower = name.toLowerCase()
  for (const [key, profile] of _profilesCache) {
    if (key.toLowerCase() === lower) return profile
    // Also check aliases
    if (profile.aliases.some(a => a.toLowerCase() === lower)) return profile
  }

  return null
}

export async function listProviders(): Promise<ProviderProfile[]> {
  await ensureProfilesLoaded()
  if (!_profilesCache) return []
  const seen = new Set<string>()
  const result: ProviderProfile[] = []
  for (const [, profile] of _profilesCache) {
    if (!seen.has(profile.name)) {
      seen.add(profile.name)
      result.push(profile)
    }
  }
  return result
}

export async function getProvidersByAuthType(
  authType: string
): Promise<ProviderProfile[]> {
  const all = await listProviders()
  return all.filter(p => p.authType === authType)
}

/**
 * Get a provider synchronously from the cache (must be loaded first).
 * Returns null if cache not loaded or provider not found.
 */
export function getProviderSync(name: string): ProviderProfile | null {
  if (!_profilesCache) return null
  const exact = _profilesCache.get(name)
  if (exact) return exact
  const lower = name.toLowerCase()
  for (const [, profile] of _profilesCache) {
    if (profile.name.toLowerCase() === lower) return profile
    if (profile.aliases.some(a => a.toLowerCase() === lower)) return profile
  }
  return null
}

// ─── Write operations ─────────────────────────────────────────────

export async function upsertProvider(
  data: ProviderProfileData
): Promise<ProviderProfileData> {
  const existing = await db
    .select()
    .from(providers)
    .where(eq(providers.name, data.name))
    .limit(1)

  const values = {
    name: data.name,
    apiMode: data.apiMode,
    aliases: data.aliases,
    displayName: data.displayName,
    description: data.description,
    signupUrl: data.signupUrl,
    envVars: data.envVars,
    baseUrl: data.baseUrl,
    modelsUrl: data.modelsUrl,
    authType: data.authType,
    supportsHealthCheck: data.supportsHealthCheck,
    hostname: data.hostname || '',
    fallbackModels: data.fallbackModels,
    defaultHeaders: data.defaultHeaders,
    fixedTemperature: data.fixedTemperature ?? null,
    defaultMaxTokens: data.defaultMaxTokens ?? null,
    defaultAuxModel: data.defaultAuxModel,
    oauthConfig: data.oauthConfig ?? null
  }

  if (existing.length > 0) {
    await db.update(providers).set(values).where(eq(providers.name, data.name))
  } else {
    await db.insert(providers).values(values)
  }

  invalidateProfilesCache()
  return (await getProvider(data.name))!
}

// ─── API Key resolution ──────────────────────────────────────────

export async function resolveApiKey(
  providerName: string
): Promise<string | null> {
  const profile = await getProvider(providerName)
  if (!profile) return null

  // Try env vars
  for (const envVar of profile.envVars) {
    const envValue = process.env[envVar]
    if (envValue && envValue.length > 4) {
      return envValue
    }
  }

  return null
}

export async function hasApiKey(providerName: string): Promise<boolean> {
  const key = await resolveApiKey(providerName)
  return key !== null
}

/**
 * Return the auth header(s) for a given API key + auth type.
 *
 * Handles all auth types:
 *   - anthropic_messages (api_mode): x-api-key + anthropic-version
 *   - oauth*: Bearer token
 *   - default: Bearer
 */
export function getAuthHeader(
  apiKey: string,
  authType: string,
  baseUrl?: string
): Record<string, string> {
  if (authType.startsWith('oauth') || authType === 'none') {
    return { Authorization: `Bearer ${apiKey}` }
  }
  if (baseUrl?.includes('anthropic.com') || baseUrl?.includes('minimax')) {
    return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
  }
  return { Authorization: `Bearer ${apiKey}` }
}

// ─── Live Model Fetching ──────────────────────────────────────────

export interface FetchModelsResult {
  models: string[]
  source: 'live' | 'fallback' | 'error'
  error?: string
}

/**
 * Fetch live model list from a provider's /models endpoint.
 *
 * Resolution order:
 *   1. Provider hook fetchModels (per-provider auth logic)
 *   2. modelsUrl (explicit override)
 *   3. baseUrl + "/models" (standard OpenAI-compat fallback)
 *   4. fallbackModels from profile (static list)
 */
export async function fetchModels(
  providerName: string
): Promise<FetchModelsResult> {
  const profile = await getProvider(providerName)
  if (!profile) {
    return {
      models: [],
      source: 'error',
      error: `Unknown provider: ${providerName}`
    }
  }

  // 1. Provider hook — per-provider fetch logic (Anthropic x-api-key, OpenRouter public)
  if (profile.hooks?.fetchModels) {
    const apiKey = await resolveApiKey(providerName)
    const models = await profile.hooks.fetchModels({
      apiKey,
      timeout: 10
    })
    if (models && models.length > 0) {
      return { models, source: 'live' }
    }
    return { models: profile.fallbackModels, source: 'fallback' }
  }

  // 2. Resolve endpoint URL
  let url = (profile.modelsUrl || '').trim()
  if (!url) {
    url = profile.baseUrl ? `${profile.baseUrl.replace(/\/+$/, '')}/models` : ''
  }

  if (!url) {
    return { models: profile.fallbackModels, source: 'fallback' }
  }

  // Get API key for auth
  const apiKey = await resolveApiKey(providerName)

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'ts-provider-oauth/0.1.0'
    }

    if (apiKey) {
      if (
        profile.apiMode === 'anthropic_messages' ||
        url.includes('anthropic')
      ) {
        headers['x-api-key'] = apiKey
      } else {
        headers.Authorization = `Bearer ${apiKey}`
      }
    }

    // Merge default headers
    for (const [k, v] of Object.entries(profile.defaultHeaders)) {
      headers[k] = v
    }

    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(8000)
    })

    if (!response.ok) {
      return {
        models: profile.fallbackModels,
        source: 'fallback',
        error: `HTTP ${response.status}`
      }
    }

    const data = (await response.json()) as Record<string, unknown>
    const items = Array.isArray(data)
      ? data
      : ((data.data as Record<string, unknown>[]) ?? [])
    const models = items
      .filter(
        (m): m is Record<string, unknown> =>
          typeof m === 'object' && m !== null && typeof m.id === 'string'
      )
      .map(m => m.id as string)

    if (models.length === 0) {
      return {
        models: profile.fallbackModels,
        source: 'fallback',
        error: 'Empty model list'
      }
    }

    return { models, source: 'live' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      models: profile.fallbackModels,
      source: 'fallback',
      error: message
    }
  }
}

// ─── Model Check (1-token validation) ────────────────────────────

export async function checkModel(
  providerName: string,
  model: string
): Promise<{ available: boolean; latencyMs?: number; error?: string }> {
  const profile = await getProvider(providerName)
  if (!profile) {
    return { available: false, error: `Unknown provider: ${providerName}` }
  }

  const apiKey =
    (await resolveApiKey(providerName)) ??
    (await getCredentials(providerName))?.accessToken
  if (!apiKey) {
    return { available: false, error: 'No credentials available' }
  }

  const startTime = Date.now()
  const url = `${profile.baseUrl.replace(/\/+$/, '')}/chat/completions`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
        stream: false
      }),
      signal: AbortSignal.timeout(15000)
    })

    const latencyMs = Date.now() - startTime

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      // Detect "Not Found" style model errors
      const errText = body.toLowerCase()
      if (
        errText.includes('not found') ||
        errText.includes('not_found') ||
        errText.includes('model_not_found') ||
        errText.includes('resp_error')
      ) {
        return { available: false, latencyMs, error: 'model_not_found' }
      }
      return {
        available: false,
        latencyMs,
        error: `HTTP ${response.status}: ${body.slice(0, 100)}`
      }
    }

    return { available: true, latencyMs }
  } catch (err) {
    const latencyMs = Date.now() - startTime
    return {
      available: false,
      latencyMs,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}
