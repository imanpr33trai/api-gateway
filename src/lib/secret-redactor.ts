/**
 * Secret Redactor — strips API keys, tokens, and secrets from
 * user-facing error messages and output strings.
 *
 * Mirrors Hermes' secret redaction in gateway/run.py.
 * Applied to all error responses before sending to client.
 */

// ─── Redaction patterns ───────────────────────────────────────────

interface RedactionRule {
  pattern: RegExp
  replacement: string
  description: string
}

const REDACTION_RULES: RedactionRule[] = [
  // sk-... OpenAI-style keys
  {
    pattern: /\b(sk-[A-Za-z0-9_-]{10,})\b/g,
    replacement: 'sk-***',
    description: 'OpenAI-style API key'
  },
  // ghp_... GitHub personal access tokens
  {
    pattern: /\b(ghp_[A-Za-z0-9_-]{10,})\b/g,
    replacement: 'ghp_***',
    description: 'GitHub PAT'
  },
  // gh*... GitHub OAuth tokens
  {
    pattern: /\b(gh[osur]_[A-Za-z0-9_-]{10,})\b/g,
    replacement: 'gh?_***',
    description: 'GitHub OAuth token'
  },
  // xoxp-... / xoxb-... Slack tokens
  {
    pattern: /\b(xox[abprs]-[A-Za-z0-9_-]{10,})\b/g,
    replacement: 'xox?-***',
    description: 'Slack token'
  },
  // hf_... HuggingFace tokens
  {
    pattern: /\b(hf_[A-Za-z0-9_-]{10,})\b/g,
    replacement: 'hf_***',
    description: 'HuggingFace token'
  },
  // glpat-... GitLab PAT
  {
    pattern: /\b(glpat-[A-Za-z0-9_-]{10,})\b/g,
    replacement: 'glpat-***',
    description: 'GitLab PAT'
  },
  // Bearer tokens in Authorization headers or URLs
  {
    pattern: /(Bearer\s+)([A-Za-z0-9._-]{8,})/g,
    replacement: '$1***',
    description: 'Bearer token'
  },
  // Generic long alphanumeric strings that look like secrets (>32 chars with mixed case)
  {
    pattern:
      /\b(?=.{32,})(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])[A-Za-z0-9_-]{32,}\b/g,
    replacement: '***',
    description: 'Generic secret (high entropy)'
  }
]

// ─── Redaction function ───────────────────────────────────────────

/**
 * Redact secrets from a string. Returns the redacted version.
 * Safe to call on any user-facing output (error messages, logs, etc.).
 */
export function redactSecrets(input: string | null | undefined): string {
  if (!input) return input ?? ''

  let result = input

  for (const rule of REDACTION_RULES) {
    result = result.replace(rule.pattern, rule.replacement)
  }

  return result
}

/**
 * Deep redact secrets from a JSON-compatible object tree.
 * Recursively walks strings in objects/arrays.
 */
export function redactDeep(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactSecrets(value)
  }
  if (Array.isArray(value)) {
    return value.map(redactDeep)
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = redactDeep(v)
    }
    return result
  }
  return value
}
