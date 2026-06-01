import { eq } from 'drizzle-orm'

import { getCredentials } from '../auth/store'
import { db } from '../db'
import { providers } from '../db/schema'
import type { ModelsResponse, ProviderProfileData } from '../types'

let profilesCache: Map<string, ProviderProfileData> | null = null

function buildFullProfileMap(
  rows: (typeof providers.$inferSelect)[]
): Map<string, ProviderProfileData> {
  const map = new Map<string, ProviderProfileData>()
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
      apiMode: row.apiMode,
      hostname: row.hostname ?? '',
      supportsHealthCheck: row.supportsHealthCheck ?? true,
      fallbackModels: Array.isArray(row.fallbackModels)
        ? row.fallbackModels
        : [],
      defaultAuxModel: row.defaultAuxModel,
      fixedTemperature: row.fixedTemperature ?? null,
      defaultMaxTokens: row.defaultMaxTokens ?? null,
      defaultHeaders: row.defaultHeaders ?? {},
      oauthConfig: row.oauthConfig
    }
    map.set(profile.name, profile)
    for (const alias of profile.aliases) {
      map.set(alias, profile)
    }
  }
  return map
}

export async function ensureProfileLoaded(): Promise<void> {
  if (profilesCache !== null) return
  try {
    const rows = await db.select().from(providers)
    profilesCache = buildFullProfileMap(rows)
  } catch {
    profilesCache = new Map()
  }
}

export function invalidateProfilesCache(): void {
  profilesCache = null
}

export async function getProvider(
  name: string
): Promise<ProviderProfileData | null> {
  await ensureProfileLoaded()
  return profilesCache?.get(name) ?? null
}

export async function listProviders(): Promise<ProviderProfileData[]> {
  await ensureProfileLoaded()
  if (!profilesCache) return []
  const seen = new Set<string>()

  const result: ProviderProfileData[] = []

  for (const [, profile] of profilesCache) {
    if (!seen.has(profile.name)) {
      seen.add(profile.name)
      result.push(profile)
    }
  }
  return result
}

export async function getProvidersByAuthType(
  authType: string
): Promise<ProviderProfileData[]> {
  const all = await listProviders()
  return all.filter(p => p.authType === authType)
}

export async function upsertProvider(
  data: ProviderProfileData
): Promise<ProviderProfileData | null> {
  const existing = await db
    .select()
    .from(providers)
    .where(eq(providers.name, data.name))
    .limit(1)

  const values: ProviderProfileData = {
    name: data.name,
    apiMode: data.apiMode,
    aliases: data.aliases,
    description: data.description,
    signupUrl: data.signupUrl,
    envVars: data.envVars,
    baseUrl: data.baseUrl,
    modelsUrl: data.modelsUrl,
    authType: data.authType,
    supportsHealthCheck: data.supportsHealthCheck,
    hostname: data.hostname || '',
    fallbackModels: data.fallbackModels,
    defaultAuxModel: data.defaultAuxModel,
    defaultHeaders: data.defaultHeaders,
    defaultMaxTokens: data.defaultMaxTokens ?? null,
    displayName: data.displayName,
    fixedTemperature: data.fixedTemperature ?? null,
    oauthConfig: data.oauthConfig ?? null
  }

  if (existing.length > 0) {
    await db.update(providers).set(values).where(eq(providers.name, data.name))
  } else {
    await db.insert(providers).values(values)
  }

  invalidateProfilesCache()
  return await getProvider(data.name)
}

export async function resolveApiKey(
  providerName: string
): Promise<string | null> {
  const profile = await getProvider(providerName)
  if (!profile) return null

  for (const envVars of profile.envVars) {
    const envValue = process.env[envVars]
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

export async function fetchModels(
  providerName: string
): Promise<ModelsResponse> {
  const profile = await getProvider(providerName)
  if (!profile) {
    return {
      models: [],
      providerName,
      source: 'error',
      error: `Unknown provider: ${providerName}`
    }
  }
  let url = (profile?.modelsUrl || '').trim()
  if (!url) {
    url = profile?.baseUrl
      ? `${profile.baseUrl.replace(/\/+$/, '')}/models`
      : ''
  }

  if (!url) {
    return {
      models: profile.fallbackModels,
      source: 'fallback',
      providerName
    }
  }
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
        headers['Authorization'] = `Bearer ${apiKey}`
      }
    }
    for (const [k, v] of Object.entries(profile.defaultHeaders)) {
      headers[k] = v
    }
    const responses = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(8000)
    })
    if (!responses.ok) {
      return {
        models: profile.fallbackModels,
        source: 'fallback',
        providerName,
        error: `HTTP ${responses.status}`
      }
    }
    const data = (await responses.json()) as Record<string, unknown>
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
        providerName,
        error: 'Empty Model List'
      }
    }
    return { models, source: 'live', providerName }
  } catch (err) {
    const messages = err instanceof Error ? err.message : String(err)
    return {
      models: profile.fallbackModels,
      source: 'fallback',
      providerName,
      error: messages
    }
  }
}

export async function checkModel(
  providerName: string,
  model: string
): Promise<{ available: boolean; latencyMs?: number; error?: string }> {
  const profile = await getProvider(providerName)
  if (!profile) {
    return { available: false, error: `Unknown provider: ${providerName}` }
  }

  const getCred = (await getCredentials(providerName))?.accessToken

  if (getCred === null) {
    return { available: false, error: 'getCredentials is null' }
  }
  const apiKey = (await resolveApiKey(providerName)) ?? getCred

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
        max_tokens: 5,
        stream: false
      }),
      signal: AbortSignal.timeout(15000)
    })

    const latencyMs = Date.now() - startTime

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      const errText = body.toLowerCase()
      if (
        errText.includes('not_found') ||
        errText.includes('model_not_found') ||
        errText.includes('resp_error')
      ) {
        return {
          available: false,
          latencyMs,
          error: 'model_not_found'
        }
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
