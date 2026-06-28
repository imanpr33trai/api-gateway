/**
 * Network Guard — checks server startup safety conditions.
 *
 * 1. Refuses to bind to 0.0.0.0 without API key configured.
 * 2. Refuses placeholder/test API keys.
 * 3. Checks port availability before binding.
 */

import { createServer } from 'node:net'

import { getConfig } from '../config'

/**
 * Check if a port is available.
 */
function isPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise(resolve => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close()
      resolve(true)
    })
    server.listen(port, host)
  })
}

/**
 * Run all pre-startup safety checks.
 * Throws with a descriptive message on failure.
 */
export async function runNetworkGuard(): Promise<void> {
  const cfg = getConfig()

  // 1. Public interface requires API key
  if (cfg.host === '0.0.0.0' && !cfg.apiKey) {
    throw new Error(
      'Refusing to bind to 0.0.0.0 without an API key configured. ' +
        'Set API_KEY in your environment or config.yaml to protect the server.'
    )
  }

  // 2. Reject placeholder keys
  if (cfg.apiKey) {
    const placeholderPatterns = [
      'your-api-key',
      'sk-your-api-key',
      'change-me',
      '***',
      'placeholder'
    ]
    const lowerKey = cfg.apiKey.toLowerCase()
    for (const pattern of placeholderPatterns) {
      if (lowerKey.includes(pattern)) {
        throw new Error(
          `API key appears to be a placeholder ('...${pattern}...'). ` +
            'Set a real API key before starting the server.'
        )
      }
    }

    // Reject if it's too short to be real
    if (cfg.apiKey.length < 8) {
      throw new Error(
        'API key is too short (minimum 8 characters). Provide a real API key.'
      )
    }
  }

  // 3. Check port availability
  const portAvailable = await isPortAvailable(cfg.port, cfg.host)
  if (!portAvailable) {
    throw new Error(
      `Port ${cfg.port} is already in use on ${cfg.host}. ` +
        'Choose a different port or stop the other process.'
    )
  }
}
