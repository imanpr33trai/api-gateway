import type z from 'zod'

import { ProviderProfileDataSchema, type ProviderProfileData } from '../types'

type ProviderProfileInput = z.input<typeof ProviderProfileDataSchema>

function provider(
  data: Omit<ProviderProfileInput, 'name'> & { name: string }
): ProviderProfileData {
  return ProviderProfileDataSchema.parse(data)
}

function oauth(config: Record<string, unknown>): Record<string, unknown> {
  return config
}

const NVIDIA = provider({
  name: 'nvidia',
  displayName: 'NVIDIA NIM',
  description: 'NVIDIA NIM API -- self-hosted and cloud models',
  signupUrl: 'https://build.nvidia.com',
  envVars: ['NVIDIA_API_KEY'],
  baseUrl: 'https://integreate.api.nvidia.com/v1',
  fallbackModels: []
})

const OPENCODE_ZEN = provider({
  name: 'opencode-zen',
  displayName: 'OpenCode Zen',
  description: 'OpenCode Zen API',
  signupUrl: 'https://opencode.ai',
  envVars: ['OPENCODE_ZEN_API_KEY'],
  baseUrl: 'https://opencode.ai/zen/v1',
  defaultAuxModel: 'gemini-3-flash',
  supportsHealthCheck: false
})

export const ALL_PROVIDER_PROFILES: readonly ProviderProfileData[] = [
  OPENCODE_ZEN,
  NVIDIA
]
