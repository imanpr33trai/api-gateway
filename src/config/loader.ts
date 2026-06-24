/**
 * Config Loader — discovers and loads config from YAML files + env vars.
 *
 * Resolution order (later overrides earlier):
 *   1. Built-in defaults from ConfigSchema
 *   2. YAML file: `./config.yaml` → `~/.config/ts-provider-oauth.yaml` → `~/.hermes/config.yaml`
 *   3. Environment variables (these take highest priority)
 *
 * All values are validated through the Zod ConfigSchema.
 */

import { load as yamlLoad } from 'js-yaml'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

import type { Config } from './schema'
import { validateConfig } from './schema'

// ─── Config paths (ordered by priority) ───────────────────────────

function getConfigPaths(): string[] {
  const home = homedir()
  const cwd = process.cwd()
  return [
    resolve(cwd, 'config.yaml'),
    resolve(cwd, 'config.yml'),
    resolve(home, '.config', 'ts-provider-oauth.yaml'),
    resolve(home, '.config', 'ts-provider-oauth.yml')
  ]
}

// ─── YAML loader ──────────────────────────────────────────────────

function loadYamlConfig(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null
    const content = readFileSync(path, 'utf-8')
    const parsed = yamlLoad(content)
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed as Record<string, unknown>
  } catch (err) {
    console.warn(`Config: failed to parse ${path}: ${(err as Error).message}`)
    return null
  }
}

// ─── Env var loader ───────────────────────────────────────────────

const ENV_MAP: Record<string, string> = {
  PORT: 'port',
  HOST: 'host',
  API_KEY: 'apiKey',
  DATABASE_URL: 'databaseUrl',
  LOG_LEVEL: 'logLevel',
  REQUEST_TIMEOUT_SECONDS: 'requestTimeoutSeconds',
  STREAM_TIMEOUT_SECONDS: 'streamTimeoutSeconds',
  RATE_LIMIT_REQUESTS_PER_WINDOW: 'rateLimitRequestsPerWindow',
  RATE_LIMIT_WINDOW_SECONDS: 'rateLimitWindowSeconds',
  FORCE_IPV4: 'forceIpv4',
  CORS_ORIGINS: 'corsOrigins',
  FALLBACK_PROVIDERS: 'fallbackProviders',
  BODY_SIZE_LIMIT: 'bodySizeLimit',
  ENABLE_SECURITY_HEADERS: 'enableSecurityHeaders',
  ENABLE_RATE_LIMITING: 'enableRateLimiting'
}

function loadEnvConfig(): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [envKey, configKey] of Object.entries(ENV_MAP)) {
    const value = process.env[envKey]
    if (value !== undefined && value !== '') {
      // Parse JSON arrays (CORS_ORIGINS, FALLBACK_PROVIDERS)
      if (envKey === 'CORS_ORIGINS' || envKey === 'FALLBACK_PROVIDERS') {
        try {
          result[configKey] = JSON.parse(value) as unknown
        } catch {
          result[configKey] = value.split(',').map(s => s.trim())
        }
      } else {
        result[configKey] = value
      }
    }
  }
  return result
}

// ─── Persistent singleton ─────────────────────────────────────────

let _config: Config | null = null

/**
 * Load (or reload) config from all sources and validate.
 * Safe to call multiple times — first call loads, subsequent calls
 * return the cached config unless `forceReload=true`.
 */
export function loadConfig(forceReload = false): Config {
  if (_config !== null && !forceReload) return _config

  // 1. Start with empty — Zod defaults fill everything
  const merged: Record<string, unknown> = {}

  // 2. Apply YAML files in order (first = lowest priority)
  const paths = getConfigPaths()
  for (const p of paths) {
    const yaml = loadYamlConfig(p)
    if (yaml) {
      Object.assign(merged, yaml)
    }
  }

  // 3. Override with env vars (highest priority)
  Object.assign(merged, loadEnvConfig())

  // 4. Validate everything through Zod
  _config = validateConfig(merged)

  return _config
}

/**
 * Get the current config. Throws if loadConfig hasn't been called.
 */
export function getConfig(): Config {
  if (_config === null) {
    throw new Error(
      'Config not loaded. Call loadConfig() during startup before accessing config.'
    )
  }
  return _config
}

/**
 * Reset the cached config (useful for testing).
 */
export function resetConfig(): void {
  _config = null
}
