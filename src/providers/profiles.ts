/**
 * All 38+ provider profiles — seed data mirroring Hermes Agent's
 * plugins/model-providers/<name>/__init__.py definitions.
 *
 * Use `provider()` to supply only non-default fields; `oauth()` for
 * partial OAuth configs. Zod fills in defaults from the schema.
 */

import type { z } from 'zod'

import type { ProviderProfileData, ProviderProfileHooks } from './types'
import { ProviderProfileDataSchema } from './types'

type ProviderProfileInput = z.input<typeof ProviderProfileDataSchema>

/** Build a ProviderProfileData from overrides — omit fields that have defaults. */
function provider(
  data: Omit<ProviderProfileInput, 'name'> & { name: string }
): ProviderProfileData {
  return ProviderProfileDataSchema.parse(data) as ProviderProfileData
}

/**
 * Build raw oauthConfig dictionary for JSONB storage.
 * The oauthConfig field is typed as Record<string, unknown> | null
 * in the DB layer; Zod validation happens at runtime when needed.
 */
function oauth(config: Record<string, unknown>): Record<string, unknown> {
  return config
}

// ========================================================================
// PROFILES — sorted roughly: multi-model routers, premium, OAuth, API-key,
// ACP, AWS, local/agnostic.  Fields with sensible defaults are omitted.
// ========================================================================

const OPENROUTER = provider({
  name: 'openrouter',
  displayName: 'OpenRouter',
  description: 'Multi-model router with unified billing and model fallback',
  signupUrl: 'https://openrouter.ai/keys',
  envVars: ['OPENROUTER_API_KEY'],
  baseUrl: 'https://openrouter.ai/api/v1',
  aliases: ['or'],
  defaultAuxModel: 'google/gemini-3-flash',
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/imanpr33t/provider-oauth',
    'X-Title': 'ts-provider-oauth'
  }
})

const NOUS = provider({
  name: 'nous',
  displayName: 'Nous Portal',
  description: 'Nous Research inference platform with OAuth device-code flow',
  signupUrl: 'https://portal.nousresearch.com',
  envVars: [],
  baseUrl: 'https://inference.nousresearch.com',
  modelsUrl: 'https://inference.nousresearch.com/models',
  authType: 'oauth_device_code',
  defaultAuxModel: 'hermes-4-3-thinking',
  oauthConfig: oauth({
    flowType: 'device_code',
    clientId: 'hermes-cli',
    portalBaseUrl: 'https://portal.nousresearch.com',
    scope: 'inference:invoke inference:mint_agent_key',
    pollIntervalMs: 2000,
    supportsRefresh: false,
    refreshSkewSeconds: 120
  })
})

const OPENAI = provider({
  name: 'openai',
  displayName: 'OpenAI',
  description: 'OpenAI API — GPT, o-series, and embedding models',
  signupUrl: 'https://platform.openai.com/api-keys',
  envVars: ['OPENAI_API_KEY'],
  baseUrl: 'https://api.openai.com/v1',
  fallbackModels: ['gpt-4o', 'gpt-4o-mini', 'o3', 'o4-mini'],
  defaultAuxModel: 'gpt-4o-mini'
})

const GEMINI = provider({
  name: 'gemini',
  displayName: 'Gemini',
  description: 'Google Gemini API (direct)',
  signupUrl: 'https://aistudio.google.com/apikey',
  envVars: ['GEMINI_API_KEY'],
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  defaultAuxModel: 'gemini-3-flash-preview',
  defaultHeaders: { 'x-goog-api-client': 'ts-provider-oauth' }
})

const GEMINI_CLI = provider({
  name: 'google-gemini-cli',
  displayName: 'Gemini CLI',
  description: 'Google Gemini API (OAuth / gcloud auth)',
  signupUrl: 'https://aistudio.google.com/apikey',
  envVars: ['GEMINI_API_KEY'],
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  authType: 'oauth_external',
  defaultAuxModel: 'gemini-3-flash-preview',
  supportsHealthCheck: false
})

const XAI = provider({
  name: 'xai',
  displayName: 'xAI Grok',
  description: 'xAI Grok API (api_key)',
  signupUrl: 'https://console.x.ai',
  envVars: ['XAI_API_KEY'],
  baseUrl: 'https://api.x.ai/v1',
  aliases: ['grok'],
  apiMode: 'codex_responses',
  defaultAuxModel: 'grok-3-mini'
})

const XAI_OAUTH = provider({
  name: 'xai-oauth',
  displayName: 'xAI Grok (OAuth)',
  description: 'xAI Grok via OAuth PKCE authorization code flow',
  signupUrl: 'https://console.x.ai',
  envVars: [],
  baseUrl: 'https://api.x.ai/v1',
  aliases: ['grok-oauth'],
  apiMode: 'codex_responses',
  authType: 'oauth_authorization_code',
  defaultAuxModel: 'grok-3-mini',
  oauthConfig: oauth({
    flowType: 'authorization_code',
    clientId: 'gXNLGNbPlDd6p0',
    portalBaseUrl: 'https://auth.x.ai',
    authorizationEndpoint: 'https://auth.x.ai/authorize',
    tokenEndpoint: 'https://auth.x.ai/oauth/token',
    scope: 'openid profile email offline_access',
    supportsRefresh: true,
    refreshSkewSeconds: 60,
    supportsManualPaste: true,
    codeChallengeMethod: 'S256',
    pollIntervalMs: 2000
  })
})

const ANTHROPIC = provider({
  name: 'anthropic',
  displayName: 'Anthropic',
  description: 'Anthropic Claude API — Messages API format',
  signupUrl: 'https://console.anthropic.com',
  envVars: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
  baseUrl: 'https://api.anthropic.com/v1',
  apiMode: 'anthropic_messages',
  defaultAuxModel: 'claude-haiku-4-5-20251001',
  defaultHeaders: { 'anthropic-version': '2023-06-01' }
})

const DEEPSEEK = provider({
  name: 'deepseek',
  displayName: 'DeepSeek',
  description: 'DeepSeek API — reasoning and chat models',
  signupUrl: 'https://platform.deepseek.com',
  envVars: ['DEEPSEEK_API_KEY'],
  baseUrl: 'https://api.deepseek.com/v1',
  aliases: ['deepseek-chat'],
  defaultAuxModel: 'deepseek-chat'
})

const DEEPSEEK_R1 = provider({
  name: 'deepseek-r1',
  displayName: 'DeepSeek R1',
  description: 'DeepSeek R1 reasoning model (separate profile)',
  signupUrl: 'https://platform.deepseek.com',
  envVars: ['DEEPSEEK_API_KEY'],
  baseUrl: 'https://api.deepseek.com/v1',
  defaultAuxModel: 'deepseek-r1'
})

const NVIDIA = provider({
  name: 'nvidia',
  displayName: 'NVIDIA NIM',
  description: 'NVIDIA NIM API — self-hosted and cloud models',
  signupUrl: 'https://build.nvidia.com',
  envVars: ['NVIDIA_API_KEY'],
  baseUrl: 'https://integrate.api.nvidia.com/v1',
  fallbackModels: [
    'nvidia/llama-3.3-nemotron-super-49b-v1',
    'meta/llama-3.1-8b-instruct'
  ],
  defaultAuxModel: 'nvidia/llama-3.3-nemotron-super-49b-v1',
  defaultMaxTokens: 16_384
})

const HUGGINGFACE = provider({
  name: 'huggingface',
  displayName: 'Hugging Face',
  description: 'Hugging Face Inference API and Inference Endpoints',
  signupUrl: 'https://huggingface.co/settings/tokens',
  envVars: ['HF_TOKEN'],
  baseUrl: 'https://router.huggingface.co/v1',
  defaultAuxModel: 'deepseek-ai/DeepSeek-R1'
})

const QWEN = provider({
  name: 'qwen',
  displayName: 'Qwen',
  description: 'Alibaba Cloud Qwen API (api_key)',
  signupUrl: 'https://model-console.alibaba.com',
  envVars: ['QWEN_API_KEY'],
  baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  modelsUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models',
  defaultAuxModel: 'qwen-max',
  defaultMaxTokens: 65_536
})

const QWEN_OAUTH = provider({
  name: 'qwen-oauth',
  displayName: 'Qwen (OAuth)',
  description: 'Alibaba Cloud Qwen — OAuth external flow via qwen.ai',
  signupUrl: 'https://chat.qwen.ai',
  envVars: [],
  baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  modelsUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models',
  authType: 'oauth_external',
  defaultAuxModel: 'qwen-plus',
  supportsHealthCheck: false,
  oauthConfig: oauth({
    flowType: 'external_process',
    clientId: 'f0304373b74a44d2b584a3fb70ca9e56',
    portalBaseUrl: 'https://chat.qwen.ai',
    tokenEndpoint: 'https://chat.qwen.ai/api/v1/oauth2/token',
    supportsRefresh: true,
    refreshSkewSeconds: 120,
    pollIntervalMs: 2000,
    codeChallengeMethod: 'S256'
  })
})

const MINIMAX = provider({
  name: 'minimax',
  displayName: 'MiniMax',
  description: 'MiniMax API (api_key)',
  signupUrl: 'https://platform.minimaxi.com',
  envVars: ['MINIMAX_API_KEY'],
  baseUrl: 'https://api.minimaxi.com/v1',
  defaultAuxModel: 'MiniMax-M2.7'
})

const MINIMAX_CN = provider({
  name: 'minimax-cn',
  displayName: 'MiniMax China',
  description: 'MiniMax API (China region)',
  signupUrl: 'https://platform.minimaxi.com',
  envVars: ['MINIMAX_API_KEY'],
  baseUrl: 'https://api.minimax.chat/v1',
  defaultAuxModel: 'MiniMax-M2.7-highspeed'
})

const MINIMAX_OAUTH = provider({
  name: 'minimax-oauth',
  displayName: 'MiniMax (OAuth)',
  description: 'MiniMax OAuth — user-code grant flow',
  signupUrl: 'https://platform.minimaxi.com',
  envVars: [],
  baseUrl: 'https://api.minimaxi.com/v1',
  apiMode: 'anthropic_messages',
  authType: 'oauth_user_code',
  defaultAuxModel: 'MiniMax-M2.7-highspeed',
  oauthConfig: oauth({
    flowType: 'user_code',
    clientId: '78257093-7e40-4613-99e0-527b14b39113',
    scope: 'group_id profile model.completion',
    portalBaseUrl: 'https://api.minimax.io',
    tokenEndpoint: 'https://api.minimax.io/oauth/token',
    supportsRefresh: true,
    refreshSkewSeconds: 60,
    pollIntervalMs: 2000,
    codeChallengeMethod: 'S256'
  })
})

const OPENAI_CODEX = provider({
  name: 'openai-codex',
  displayName: 'OpenAI Codex',
  description: 'OpenAI Codex — Responses API via OAuth external flow',
  signupUrl: 'https://codex.openai.com',
  envVars: [],
  baseUrl: 'https://api.openai.com/v1',
  modelsUrl: 'https://api.openai.com/v1/models',
  authType: 'oauth_external',
  apiMode: 'codex_responses',
  defaultAuxModel: 'gpt-4o-mini',
  supportsHealthCheck: false,
  oauthConfig: oauth({
    flowType: 'external_process',
    clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
    portalBaseUrl: 'https://auth.openai.com',
    tokenEndpoint: 'https://auth.openai.com/oauth/token',
    supportsRefresh: true,
    refreshSkewSeconds: 120
  })
})

const LMSTUDIO = provider({
  name: 'lmstudio',
  displayName: 'LM Studio',
  description: 'Local LM Studio server',
  signupUrl: 'https://lmstudio.ai',
  envVars: [],
  baseUrl: 'http://localhost:1234/v1',
  authType: 'none',
  supportsHealthCheck: false,
  fallbackModels: ['local-model']
})

const OLLAMA = provider({
  name: 'ollama',
  displayName: 'Ollama',
  description: 'Local Ollama server',
  signupUrl: 'https://ollama.ai',
  envVars: [],
  baseUrl: 'http://localhost:11434/v1',
  authType: 'none',
  supportsHealthCheck: false,
  fallbackModels: ['llama3']
})

const OLLAMA_CLOUD = provider({
  name: 'ollama-cloud',
  displayName: 'Ollama Cloud',
  description: 'Ollama Cloud hosted API',
  signupUrl: 'https://cloud.ollama.ai',
  envVars: ['OLLAMA_API_KEY'],
  baseUrl: 'https://api.ollama.cloud/v1',
  defaultAuxModel: 'nemotron-3-nano:30b'
})

const COPILOT = provider({
  name: 'copilot',
  displayName: 'GitHub Copilot',
  description: 'GitHub Copilot API',
  signupUrl: 'https://github.com/settings/copilot',
  envVars: [],
  baseUrl: 'https://api.githubcopilot.com',
  authType: 'copilot',
  supportsHealthCheck: false
})

const COPILOT_ACP = provider({
  name: 'copilot-acp',
  displayName: 'Copilot ACP',
  description: 'GitHub Copilot via agent-to-agent protocol',
  envVars: [],
  baseUrl: '',
  authType: 'external_process',
  supportsHealthCheck: false
})

const KIMI = provider({
  name: 'kimi',
  displayName: 'Kimi (Intl)',
  description: 'Moonshot AI Kimi — reasoning models',
  signupUrl: 'https://kimi.moonshot.cn',
  envVars: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'],
  baseUrl: 'https://api.moonshot.cn/v1',
  defaultAuxModel: 'kimi-k2-turbo-preview',
  defaultMaxTokens: 32_000,
  defaultHeaders: { 'User-Agent': 'hermes-agent/1.0' },
  fixedTemperature: 1 // OMIT_TEMPERATURE sentinel — KIMI manages temp server-side
})

const KIMI_CODING = provider({
  name: 'kimi-coding',
  displayName: 'Kimi Coding (Intl)',
  description: 'Moonshot AI Kimi — coding-optimized models',
  signupUrl: 'https://kimi.moonshot.cn',
  envVars: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'],
  baseUrl: 'https://api.moonshot.cn/v1',
  defaultAuxModel: 'kimi-k2-turbo-preview',
  defaultMaxTokens: 32_000,
  defaultHeaders: { 'User-Agent': 'hermes-agent/1.0' },
  fixedTemperature: 1
})

const KIMI_CODING_CN = provider({
  name: 'kimi-coding-cn',
  displayName: 'Kimi Coding (CN)',
  description: 'Moonshot AI Kimi — China region coding-optimized',
  signupUrl: 'https://kimi.moonshot.cn',
  envVars: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'],
  baseUrl: 'https://api.moonshot.cn/v1',
  defaultAuxModel: 'kimi-k2-turbo-preview',
  defaultMaxTokens: 32_000,
  defaultHeaders: { 'User-Agent': 'hermes-agent/1.0' },
  fixedTemperature: 1
})

const BEDROCK = provider({
  name: 'bedrock',
  displayName: 'AWS Bedrock',
  description: 'AWS Bedrock Converse API — Claude, Llama, Mistral',
  signupUrl: 'https://aws.amazon.com/bedrock',
  envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
  baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
  authType: 'aws_sdk',
  apiMode: 'bedrock_converse',
  supportsHealthCheck: false
})

const ARCEE = provider({
  name: 'arcee',
  displayName: 'Arcee AI',
  description: 'Arcee AI API — domain-specialized models',
  signupUrl: 'https://www.arcee.ai',
  envVars: ['ARCEEAI_API_KEY'],
  baseUrl: 'https://api.arcee.ai/api/v1'
})

const ZAI = provider({
  name: 'zai',
  displayName: 'Z.AI (GLM)',
  description: 'Zhipu AI GLM models',
  signupUrl: 'https://www.zhipu.com',
  envVars: ['ZHIPUAI_API_KEY', 'ZHISHU_API_KEY'],
  baseUrl: 'https://api.z.ai/api/paas/v4',
  fallbackModels: ['glm-5', 'glm-4-9b'],
  defaultAuxModel: 'glm-4.5-flash'
})

const NOVITA = provider({
  name: 'novita',
  displayName: 'Novita AI',
  description: 'Novita AI — diverse model catalog',
  signupUrl: 'https://novita.ai',
  envVars: ['NOVITA_API_KEY'],
  baseUrl: 'https://api.novita.ai/openai/v1',
  fallbackModels: [
    'deepseek/deepseek-v3-0324',
    'deepseek/deepseek-r1',
    'sophosympatheia/rogue-r1-32b',
    'qwen/qwen3-30b-a3b',
    'meta-llama/llama-3.2-3b-instruct',
    'qwen/qwen2.5-coder-32b-instruct'
  ],
  defaultAuxModel: 'deepseek/deepseek-v3-0324'
})

const KILOCODE = provider({
  name: 'kilocode',
  displayName: 'KiloCode',
  description: 'KiloCode — code-specialized models',
  signupUrl: 'https://kilocode.ai',
  envVars: ['KILOCODE_API_KEY'],
  baseUrl: 'https://api.kilo.ai/api/gateway',
  defaultAuxModel: 'google/gemini-3-flash-preview'
})

const GMI = provider({
  name: 'gmi',
  displayName: 'GMI Cloud',
  description: 'GMI Cloud — multi-model direct API',
  signupUrl: 'https://www.gmicloud.ai',
  envVars: ['GMI_API_KEY'],
  baseUrl: 'https://api.gmi-serving.com/v1',
  fallbackModels: [
    'google/gemini-3.1-flash',
    'google/gemini-3-flash',
    'meta/llama-4-maverick',
    'meta/llama-4-scout',
    'deepseek/deepseek-r1-671b',
    'deepseek/deepseek-v3-0324'
  ],
  defaultAuxModel: 'google/gemini-3.1-flash-lite-preview',
  defaultHeaders: { 'User-Agent': 'HermesAgent' }
})

const AI_GATEWAY = provider({
  name: 'ai-gateway',
  displayName: 'Vercel AI Gateway',
  description: 'Vercel AI Gateway — proxy to many providers',
  signupUrl: 'https://vercel.com/docs/ai-gateway',
  envVars: ['AI_GATEWAY_API_KEY'],
  baseUrl: 'https://ai-gateway.vercel.sh/v1',
  defaultAuxModel: 'google/gemini-3-flash',
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/imanpr33t/provider-oauth',
    'X-Title': 'ts-provider-oauth'
  }
})

const ALIBABA = provider({
  name: 'alibaba',
  displayName: 'Alibaba Cloud',
  description: 'Alibaba Cloud DashScope API',
  signupUrl: 'https://model-console.alibaba.com',
  envVars: ['DASHSCOPE_API_KEY'],
  baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
})

const ALIBABA_CODING_PLAN = provider({
  name: 'alibaba-coding-plan',
  displayName: 'Alibaba Coding Plan',
  description: 'Alibaba Cloud — coding-optimized endpoint',
  signupUrl: 'https://model-console.alibaba.com',
  envVars: ['DASHSCOPE_API_KEY'],
  baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/compatible-mode/v1',
  defaultAuxModel: 'qwen-max'
})

const XIAOMI = provider({
  name: 'xiaomi',
  displayName: 'Xiaomi Mimo',
  description: 'Xiaomi AI platform',
  signupUrl: 'https://xiaomimimo.com',
  envVars: ['XIAOMI_API_KEY', 'MIMO_API_KEY'],
  baseUrl: 'https://api.xiaomimimo.com/v1',
  supportsHealthCheck: false
})

const AZURE_FOUNDRY = provider({
  name: 'azure-foundry',
  displayName: 'Azure Foundry',
  description: 'Microsoft Azure AI Foundry',
  signupUrl: 'https://ai.azure.com',
  envVars: ['AZURE_FOUNDRY_API_KEY', 'AZURE_FOUNDRY_BASE_URL'],
  baseUrl: '',
  supportsHealthCheck: false
})

const STEPFUN = provider({
  name: 'stepfun',
  displayName: 'StepFun',
  description: 'StepFun API',
  signupUrl: 'https://stepfun.com',
  envVars: ['STEPFUN_API_KEY'],
  baseUrl: 'https://api.stepfun.ai/step_plan/v1',
  defaultAuxModel: 'step-3.5-flash'
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

const OPENCODE_GO = provider({
  name: 'opencode-go',
  displayName: 'OpenCode Go',
  description: 'OpenCode Go API',
  signupUrl: 'https://opencode.ai',
  envVars: [],
  baseUrl: 'https://opencode.ai/go/v1',
  defaultAuxModel: 'glm-5',
  supportsHealthCheck: false
})

const CUSTOM = provider({
  name: 'custom',
  displayName: 'Custom / Generic',
  description: 'Custom OpenAI-compatible endpoint',
  signupUrl: '',
  envVars: ['CUSTOM_API_KEY', 'CUSTOM_BASE_URL'],
  baseUrl: '',
  supportsHealthCheck: false,
  fallbackModels: ['custom-model']
})

// ─── OpenAI-compatible providers (from gpt4free needs_auth) ───────

const AIBADGR = provider({
  name: 'aibadgr',
  displayName: 'AI Badgr',
  description: 'AI Badgr — OpenAI-compatible API',
  signupUrl: 'https://aibadgr.com/api-keys',
  envVars: ['AIBADGR_API_KEY'],
  baseUrl: 'https://aibadgr.com/api/v1',
  authType: 'api_key',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gpt-4o-mini']
})

const CABLYAI = provider({
  name: 'cablyai',
  displayName: 'CablyAI',
  description: 'CablyAI — free AI chat',
  signupUrl: 'https://cablyai.com',
  envVars: ['CABLYAI_API_KEY'],
  baseUrl: 'https://cablyai.com/chat',
  authType: 'api_key',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gpt-4o-mini']
})

const FENAYAI = provider({
  name: 'fenayai',
  displayName: 'FenayAI',
  description: 'FenayAI — AI chat platform',
  signupUrl: 'https://fenayai.com/dashboard',
  envVars: ['FENAYAI_API_KEY'],
  baseUrl: 'https://fenayai.com',
  authType: 'api_key',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gpt-4o-mini']
})

const REKA = provider({
  name: 'reka',
  displayName: 'Reka AI',
  description: 'Reka AI — multimodal API',
  signupUrl: 'https://reka.ai',
  envVars: ['REKA_API_KEY'],
  baseUrl: 'https://api.reka.ai',
  authType: 'api_key',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['reka-core']
})

const VIDEO_GEN = provider({
  name: 'video-gen',
  displayName: 'Video Generation',
  description: 'AI video generation',
  signupUrl: '',
  envVars: ['VIDEO_GEN_API_KEY'],
  baseUrl: '',
  authType: 'api_key',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['video-gen']
})

const POLLINATIONS_AI = provider({
  name: 'PollinationsAI',
  displayName: 'PollinationsAI',
  description: 'Free AI text generation via pollinations.ai',
  signupUrl: 'https://pollinations.ai',
  envVars: [],
  baseUrl: 'https://text.pollinations.ai',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['openai']
})

const DEEPINFRA = provider({
  name: 'DeepInfra',
  displayName: 'DeepInfra',
  description: 'Free AI inference via deepinfra.com',
  signupUrl: '',
  envVars: [],
  baseUrl: 'https://api.deepinfra.com/v1/openai',
  modelsUrl: 'https://api.deepinfra.com/v1/openai/models',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: [
    'meta-llama/Llama-2-70b-chat-hf',
    'MiniMaxAI/MiniMax-M2.5',
    'mistralai/Mixtral-8x22B-Instruct-v0.1'
  ]
})

const LAMBDACHAT = provider({
  name: 'LambdaChat',
  displayName: 'LambdaChat',
  description: 'Free AI chat via lambdalabs.com',
  signupUrl: '',
  envVars: [],
  baseUrl: 'https://lambda.chat',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['llama']
})

const ITALYGPT = provider({
  name: 'ItalyGPT',
  displayName: 'ItalyGPT',
  description: 'Free Italian AI chat',
  signupUrl: '',
  envVars: [],
  baseUrl: 'https://italygpt.it',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gpt-3.5-turbo']
})

const PERPLEXITY = provider({
  name: 'Perplexity',
  displayName: 'Perplexity',
  description: 'AI search via perplexity.ai (needs cookies)',
  signupUrl: 'https://perplexity.ai',
  envVars: [],
  baseUrl: 'https://www.perplexity.ai',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['sonar']
})

const COPILOT_FREE = provider({
  name: 'Copilot',
  displayName: 'Copilot (Free)',
  description: 'GitHub Copilot free chat',
  signupUrl: 'https://github.com',
  envVars: [],
  baseUrl: 'https://api.githubcopilot.com',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gpt-4o']
})

const EASYCHAT = provider({
  name: 'EasyChat',
  displayName: 'EasyChat',
  description: 'Free chat via easychat.team',
  signupUrl: '',
  envVars: [],
  baseUrl: 'https://api.easychat.team',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gpt-4o-mini']
})

const OPERA_ARIA = provider({
  name: 'OperaAria',
  displayName: 'OperaAria',
  description: 'Opera browser AI assistant',
  signupUrl: '',
  envVars: [],
  baseUrl: 'https://api.opera.com',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['aria']
})

const CLOUDFLARE_FREE = provider({
  name: 'Cloudflare',
  displayName: 'Cloudflare (Free)',
  description: 'Cloudflare Workers AI free tier',
  signupUrl: '',
  envVars: [],
  baseUrl: 'https://api.cloudflare.com/client/v4/ai',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['@cf/meta/llama-2-7b-chat-int8']
})

const CHATAI_FREE = provider({
  name: 'Chatai',
  displayName: 'Chatai',
  description: 'Free AI chat',
  signupUrl: '',
  envVars: [],
  baseUrl: 'https://chatai.lol',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gpt-4o-mini']
})

// ─── API-key providers (ported from gpt4free needs_auth) ──────────

const GROQ = provider({
  name: 'groq',
  displayName: 'Groq',
  description: 'Groq LPU inference — fast open-source models',
  signupUrl: 'https://console.groq.com/keys',
  envVars: ['GROQ_API_KEY'],
  baseUrl: 'https://api.groq.com/openai/v1',
  authType: 'api_key',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['llama-3.3-70b-versatile']
})

const TOGETHER = provider({
  name: 'together',
  displayName: 'Together AI',
  description: 'Together AI — cloud platform for open-source models',
  signupUrl: 'https://api.together.ai/signup',
  envVars: ['TOGETHER_API_KEY'],
  baseUrl: 'https://api.together.xyz/v1',
  authType: 'api_key',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['meta-llama/Llama-3.3-70B-Instruct-Turbo']
})

const COHERE = provider({
  name: 'cohere',
  displayName: 'Cohere',
  description: 'Cohere — enterprise AI platform',
  signupUrl: 'https://dashboard.cohere.com/api-keys',
  envVars: ['COHERE_API_KEY'],
  baseUrl: 'https://api.cohere.ai/v2',
  authType: 'api_key',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['command-r-plus']
})

const CEREBRAS = provider({
  name: 'cerebras',
  displayName: 'Cerebras',
  description: 'Cerebras AI inference',
  signupUrl: 'https://cloud.cerebras.ai',
  envVars: ['CEREBRAS_API_KEY'],
  baseUrl: 'https://api.cerebras.ai/v1',
  authType: 'api_key',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['llama-3.3-70b']
})

const REPLICATE = provider({
  name: 'replicate',
  displayName: 'Replicate',
  description: 'Replicate — cloud API for open-source models',
  signupUrl: 'https://replicate.com/account/api-tokens',
  envVars: ['REPLICATE_API_KEY'],
  baseUrl: 'https://api.replicate.com/v1',
  authType: 'api_key',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['meta/meta-llama-3-70b-instruct']
})

const PERPLEXITY_API = provider({
  name: 'perplexity-api',
  displayName: 'Perplexity API',
  description: 'Perplexity AI — API access',
  signupUrl: 'https://www.perplexity.ai/settings/api',
  envVars: ['PERPLEXITY_API_KEY'],
  baseUrl: 'https://api.perplexity.ai',
  authType: 'api_key',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['sonar-pro']
})

const COPILOT_SESSION = provider({
  name: 'CopilotSession',
  displayName: 'Copilot (Session)',
  description: 'GitHub Copilot session-based chat',
  signupUrl: 'https://github.com',
  envVars: [],
  baseUrl: 'https://api.githubcopilot.com',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gpt-4o']
})

const GLM_FREE = provider({
  name: 'GLM',
  displayName: 'GLM',
  description: 'Zhipu GLM free chat (needs cookies)',
  signupUrl: 'https://chatglm.cn',
  envVars: [],
  baseUrl: 'https://chatglm.cn',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['glm-4']
})

const QWEN_FREE = provider({
  name: 'Qwen',
  displayName: 'Qwen (Free)',
  description: 'Alibaba Qwen free chat (needs cookies)',
  signupUrl: 'https://qwen.alibaba.com',
  envVars: [],
  baseUrl: 'https://qwen.alibaba.com',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['qwen-max']
})

// ─── Free providers (complex auth) ────────────────────────────────

const ANTIGRAVITY_FREE = provider({
  name: 'Antigravity',
  displayName: 'Antigravity',
  description: 'Google Cloud Code AI (OAuth2 Bearer)',
  signupUrl: '',
  envVars: [],
  baseUrl: 'https://cloudcode-pa.googleapis.com',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gemini-2.0-flash']
})

const BLACKBOX_PRO_FREE = provider({
  name: 'BlackboxPro',
  displayName: 'BlackboxPro',
  description: 'Blackbox AI chat (needs session cookie)',
  signupUrl: 'https://blackbox.ai',
  envVars: [],
  baseUrl: 'https://blackbox.ai',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['blackbox-pro']
})

const LM_ARENA_FREE = provider({
  name: 'LMArena',
  displayName: 'LMArena',
  description: 'LM Arena AI chat (needs auth cookie)',
  signupUrl: 'https://lmarena.ai',
  envVars: [],
  baseUrl: 'https://lmarena.ai',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gpt-4o']
})

const OPENAI_CHAT_FREE = provider({
  name: 'OpenaiChat',
  displayName: 'OpenaiChat',
  description: 'ChatGPT free web chat (needs HAR access token)',
  signupUrl: 'https://chatgpt.com',
  envVars: [],
  baseUrl: 'https://chatgpt.com',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gpt-4o']
})

const META_AI_FREE = provider({
  name: 'MetaAI',
  displayName: 'MetaAI',
  description: 'Meta AI chat (needs LSD cookie)',
  signupUrl: 'https://meta.ai',
  envVars: [],
  baseUrl: 'https://meta.ai',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['llama-4']
})

const YOU_FREE = provider({
  name: 'You',
  displayName: 'You.com',
  description: 'You.com AI chat (needs afUserId cookie)',
  signupUrl: 'https://you.com',
  envVars: [],
  baseUrl: 'https://you.com',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gpt-4o']
})

const PUTER_JS_FREE = provider({
  name: 'PuterJS',
  displayName: 'PuterJS',
  description: 'Puter.js AI chat (needs API key)',
  signupUrl: 'https://puter.com',
  envVars: [],
  baseUrl: 'https://api.puter.com',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gpt-4o']
})

const PI_FREE = provider({
  name: 'Pi',
  displayName: 'Pi',
  description: 'Pi AI chat (needs browser session)',
  signupUrl: 'https://pi.ai',
  envVars: [],
  baseUrl: 'https://pi.ai',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['pi']
})

const MS_DESIGNER_FREE = provider({
  name: 'MicrosoftDesigner',
  displayName: 'MicrosoftDesigner',
  description: 'Microsoft Designer image gen (needs access token)',
  signupUrl: 'https://designer.microsoft.com',
  envVars: [],
  baseUrl: 'https://designerapp.officeapps.live.com',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['dalle-3']
})

// ─── Free providers (simple, from simple.ts) ──────────────────────

const GRADIENT_NETWORK = provider({
  name: 'GradientNetwork',
  displayName: 'GradientNetwork',
  description: 'Free AI inference',
  signupUrl: '',
  envVars: [],
  baseUrl: 'https://api.gradient.network',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gradient']
})

const MINTLIFY = provider({
  name: 'Mintlify',
  displayName: 'Mintlify',
  description: 'Documentation AI chat',
  signupUrl: '',
  envVars: [],
  baseUrl: 'https://api.mintlify.ai',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gpt-4o-mini']
})

const WEWORDLE = provider({
  name: 'WeWordle',
  displayName: 'WeWordle',
  description: 'Wordle game AI',
  signupUrl: '',
  envVars: [],
  baseUrl: 'https://api.wewordle.com',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gpt-3.5']
})

const YQCLOUD = provider({
  name: 'Yqcloud',
  displayName: 'Yqcloud',
  description: 'Free AI chat',
  signupUrl: '',
  envVars: [],
  baseUrl: 'https://api.yqcloud.com',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gpt-3.5-turbo']
})

const TEACH_ANYTHING = provider({
  name: 'TeachAnything',
  displayName: 'TeachAnything',
  description: 'Educational AI tutor',
  signupUrl: '',
  envVars: [],
  baseUrl: 'https://api.teachanything.com',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gpt-3.5-turbo']
})

const API_AIRFORCE = provider({
  name: 'ApiAirforce',
  displayName: 'ApiAirforce',
  description: 'Free AI API',
  signupUrl: '',
  envVars: [],
  baseUrl: 'https://api.airforce',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gpt-4o-mini']
})

const OIVS_CODESER = provider({
  name: 'OIVSCodeSer',
  displayName: 'OIVSCodeSer',
  description: 'VS Code server AI',
  signupUrl: '',
  envVars: [],
  baseUrl: 'https://api.oivscodeser.com',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gpt-3.5-turbo']
})

const POLLINATIONS_IMAGE = provider({
  name: 'PollinationsImage',
  displayName: 'PollinationsImage',
  description: 'Free AI image generation',
  signupUrl: 'https://pollinations.ai',
  envVars: [],
  baseUrl: 'https://image.pollinations.ai',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['flux']
})

const YUPP_FREE = provider({
  name: 'Yupp',
  displayName: 'Yupp',
  description: 'Yupp.ai multi-model aggregator (needs account token)',
  signupUrl: 'https://yupp.ai',
  envVars: [],
  baseUrl: 'https://yupp.ai',
  authType: 'free',
  apiMode: 'chat_completions',
  supportsHealthCheck: false,
  fallbackModels: ['gpt-4o-mini']
})

const _ALL_PROVIDER_PROFILES = [
  OPENROUTER,
  NOUS,
  AI_GATEWAY,
  OPENAI,
  ANTHROPIC,
  GEMINI,
  GEMINI_CLI,
  XAI,
  XAI_OAUTH,
  MINIMAX,
  MINIMAX_CN,
  MINIMAX_OAUTH,
  QWEN,
  QWEN_OAUTH,
  OPENAI_CODEX,
  DEEPSEEK,
  DEEPSEEK_R1,
  NVIDIA,
  HUGGINGFACE,
  KIMI,
  KIMI_CODING,
  KIMI_CODING_CN,
  ARCEE,
  ZAI,
  NOVITA,
  KILOCODE,
  GMI,
  ALIBABA,
  ALIBABA_CODING_PLAN,
  XIAOMI,
  AZURE_FOUNDRY,
  STEPFUN,
  OPENCODE_ZEN,
  OPENCODE_GO,
  OLLAMA_CLOUD,
  COPILOT,
  COPILOT_ACP,
  BEDROCK,
  LMSTUDIO,
  OLLAMA,
  CUSTOM,
  POLLINATIONS_AI,
  DEEPINFRA,
  LAMBDACHAT,
  ITALYGPT,
  PERPLEXITY,
  COPILOT_FREE,
  EASYCHAT,
  OPERA_ARIA,
  CLOUDFLARE_FREE,
  CHATAI_FREE,
  COPILOT_SESSION,
  GLM_FREE,
  QWEN_FREE,
  GROQ,
  TOGETHER,
  COHERE,
  CEREBRAS,
  REPLICATE,
  PERPLEXITY_API,
  ANTIGRAVITY_FREE,
  BLACKBOX_PRO_FREE,
  LM_ARENA_FREE,
  OPENAI_CHAT_FREE,
  META_AI_FREE,
  YOU_FREE,
  PUTER_JS_FREE,
  PI_FREE,
  MS_DESIGNER_FREE,
  GRADIENT_NETWORK,
  MINTLIFY,
  WEWORDLE,
  YQCLOUD,
  TEACH_ANYTHING,
  API_AIRFORCE,
  OIVS_CODESER,
  POLLINATIONS_IMAGE,
  YUPP_FREE,
  AIBADGR,
  CABLYAI,
  FENAYAI,
  REKA,
  VIDEO_GEN
] as const satisfies ProviderProfileData[]

export const ALL_PROVIDER_PROFILES: readonly ProviderProfileData[] =
  _ALL_PROVIDER_PROFILES

// ========================================================================
// PROVIDER HOOKS — separate from data, merged at registration time
// ========================================================================

/**
 * Provider-specific hook implementations. These are attached at runtime
 * when building the full ProviderProfile (data + hooks).
 *
 * Key:
 *   "openrouter" → ProviderProfileHooks object
 */
export const PROVIDER_HOOKS: Record<string, ProviderProfileHooks> = {
  // ── DeepSeek ──────────────────────────────────────────────────
  'deepseek': {
    buildApiKwargsExtras({ reasoningConfig, model }) {
      const extraBody: Record<string, unknown> = {}
      const topLevel: Record<string, unknown> = {}
      const m = (model ?? '').toLowerCase()

      // Only V4+ and deepseek-reasoner support thinking
      const supportsThinking =
        (m.startsWith('deepseek-v') && !m.startsWith('deepseek-v3')) ||
        m === 'deepseek-reasoner'
      if (!supportsThinking) return { extraBody, topLevel }

      const enabled = reasoningConfig?.enabled !== false
      extraBody.thinking = { type: enabled ? 'enabled' : 'disabled' }

      if (enabled && reasoningConfig?.effort) {
        const effort = reasoningConfig.effort.toLowerCase()
        topLevel.reasoning_effort = effort === 'xhigh' ? 'max' : effort
      }

      return { extraBody, topLevel }
    }
  },

  // ── Kimi ──────────────────────────────────────────────────────
  'kimi-coding': {
    buildApiKwargsExtras({ reasoningConfig }) {
      const extraBody: Record<string, unknown> = {}
      const topLevel: Record<string, unknown> = {}
      const enabled = reasoningConfig?.enabled !== false

      extraBody.thinking = { type: enabled ? 'enabled' : 'disabled' }

      if (enabled) {
        const effort = reasoningConfig?.effort?.toLowerCase() ?? 'medium'
        topLevel.reasoning_effort = [
          'minimal',
          'low',
          'medium',
          'high'
        ].includes(effort)
          ? effort
          : 'medium'
      }

      return { extraBody, topLevel }
    }
  },
  'kimi-coding-cn': {
    buildApiKwargsExtras({ reasoningConfig }) {
      const extraBody: Record<string, unknown> = {}
      const topLevel: Record<string, unknown> = {}
      const enabled = reasoningConfig?.enabled !== false
      extraBody.thinking = { type: enabled ? 'enabled' : 'disabled' }
      if (enabled) {
        const effort = reasoningConfig?.effort?.toLowerCase() ?? 'medium'
        topLevel.reasoning_effort = [
          'minimal',
          'low',
          'medium',
          'high'
        ].includes(effort)
          ? effort
          : 'medium'
      }
      return { extraBody, topLevel }
    }
  },

  // ── Gemini (CLI variant) ──────────────────────────────────────
  'google-gemini-cli': {
    buildExtraBody() {
      const body: Record<string, unknown> = {}
      // Gemini reasoning is handled in chat-completions.ts switch
      // (the hook pattern defers to existing code path)
      return body
    }
  },

  // ── OpenRouter ────────────────────────────────────────────────
  'openrouter': {
    buildExtraBody({ sessionId, model, providerPreferences }) {
      const body: Record<string, unknown> = {}
      if (sessionId) body.session_id = sessionId
      if (providerPreferences) body.provider = providerPreferences

      // Pareto Code router
      if (
        model === 'openrouter/pareto-code' &&
        providerPreferences?.openrouterMinCodingScore != null
      ) {
        const score = Number(providerPreferences.openrouterMinCodingScore)
        if (score >= 0 && score <= 1) {
          body.plugins = [{ id: 'pareto-router', min_coding_score: score }]
        }
      }
      return body
    },
    buildApiKwargsExtras({ reasoningConfig, supportsReasoning }) {
      if (!reasoningConfig || !supportsReasoning)
        return { extraBody: {}, topLevel: {} }
      return { extraBody: { reasoning: reasoningConfig }, topLevel: {} }
    },
    fetchModels({ timeout = 8 }) {
      // OpenRouter public catalog — no auth needed
      return fetchModelsFromUrl('https://openrouter.ai/api/v1/models', timeout)
    }
  },

  // ── Nous ──────────────────────────────────────────────────────
  'nous': {
    buildExtraBody({}) {
      return {
        tags: {
          source: 'ts-provider-oauth',
          version: '0.1.0'
        }
      }
    },
    buildApiKwargsExtras({ reasoningConfig, supportsReasoning }) {
      if (!reasoningConfig || !supportsReasoning)
        return { extraBody: {}, topLevel: {} }
      return { extraBody: { reasoning: reasoningConfig }, topLevel: {} }
    }
  },

  // ── Qwen ──────────────────────────────────────────────────────
  'qwen': {
    prepareMessages(messages) {
      // Inject cache_control on system messages when multiple turns
      return messages.map((msg, idx) => {
        if (msg.role === 'system' && idx === 0) {
          return {
            ...msg,
            content: `[system]\n${typeof msg.content === 'string' ? msg.content : ''}`
          } as typeof msg
        }
        return msg
      })
    },
    buildExtraBody({}) {
      return { vl_high_resolution_images: true }
    },
    buildApiKwargsExtras({ reasoningConfig }) {
      if (!reasoningConfig || reasoningConfig.enabled === false)
        return { extraBody: {}, topLevel: {} }
      return {
        extraBody: {
          enable_thinking: true,
          thinking_config: {
            type: reasoningConfig.effort ?? 'medium'
          }
        },
        topLevel: {}
      }
    }
  },
  'qwen-oauth': {
    prepareMessages(messages) {
      return messages.map((msg, idx) => {
        if (msg.role === 'system' && idx === 0) {
          return {
            ...msg,
            content: `[system]\n${typeof msg.content === 'string' ? msg.content : ''}`
          } as typeof msg
        }
        return msg
      })
    },
    buildExtraBody({}) {
      return { vl_high_resolution_images: true }
    },
    buildApiKwargsExtras({ reasoningConfig }) {
      if (!reasoningConfig || reasoningConfig.enabled === false)
        return { extraBody: {}, topLevel: {} }
      return {
        extraBody: {
          enable_thinking: true,
          thinking_config: { type: reasoningConfig.effort ?? 'medium' }
        },
        topLevel: {}
      }
    }
  },

  // ── Anthropic ─────────────────────────────────────────────────
  'anthropic': {
    fetchModels({ apiKey, timeout = 8 }) {
      if (!apiKey) return Promise.resolve(null)
      return fetchAnthropicModels(apiKey, timeout)
    }
  },

  // ── Copilot ───────────────────────────────────────────────────
  'copilot': {
    buildApiKwargsExtras({ reasoningConfig }) {
      const extraBody: Record<string, unknown> = {}
      const topLevel: Record<string, unknown> = {}
      if (reasoningConfig && reasoningConfig.enabled !== false) {
        topLevel.intent = true
        extraBody.github_models_reasoning = true
      }
      return { extraBody, topLevel }
    }
  },

  // ── OpenCode Zen ──────────────────────────────────────────────
  'opencode-zen': {
    getMaxTokens(model) {
      if (!model) return null
      const m = model.toLowerCase()
      if (
        m.includes('deepseek') ||
        m.includes('r1') ||
        m.includes('claude-3.5')
      ) {
        return 8192
      }
      return null
    },
    buildApiKwargsExtras({ reasoningConfig }) {
      if (!reasoningConfig) return { extraBody: {}, topLevel: {} }
      return {
        extraBody: { reasoning: reasoningConfig },
        topLevel: {}
      }
    }
  },

  // ── OpenCode Go ───────────────────────────────────────────────
  'opencode-go': {
    getMaxTokens(model) {
      if (!model) return null
      const m = model.toLowerCase()
      if (
        m.includes('deepseek') ||
        m.includes('r1') ||
        m.includes('claude-3.5')
      ) {
        return 8192
      }
      return null
    },
    buildApiKwargsExtras({ reasoningConfig }) {
      if (!reasoningConfig) return { extraBody: {}, topLevel: {} }
      return {
        extraBody: { reasoning: reasoningConfig },
        topLevel: {}
      }
    }
  }
}

/**
 * Fetch models from a public URL (no auth).
 */
async function fetchModelsFromUrl(
  url: string,
  timeout: number
): Promise<string[] | null> {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(timeout * 1000),
      headers: { Accept: 'application/json' }
    })
    if (!resp.ok) return null
    const data = (await resp.json()) as Record<string, unknown>
    const items = Array.isArray(data)
      ? data
      : ((data.data as Record<string, unknown>[]) ?? [])
    return items
      .filter(
        (m): m is Record<string, unknown> =>
          typeof m === 'object' && m !== null && typeof m.id === 'string'
      )
      .map(m => m.id as string)
  } catch {
    return null
  }
}

/**
 * Fetch Anthropic models using x-api-key header style.
 */
async function fetchAnthropicModels(
  apiKey: string,
  timeout: number
): Promise<string[] | null> {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/models', {
      signal: AbortSignal.timeout(timeout * 1000),
      headers: {
        'Accept': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    })
    if (!resp.ok) return null
    const data = (await resp.json()) as Record<string, unknown>
    const items = (data.data as Record<string, unknown>[]) ?? []
    return items
      .filter(
        (m): m is Record<string, unknown> =>
          typeof m === 'object' && m !== null && typeof m.id === 'string'
      )
      .map(m => m.id as string)
  } catch {
    return null
  }
}
