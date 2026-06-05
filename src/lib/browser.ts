import { execSync } from 'node:child_process'
import { platform } from 'node:os'

/**
 * Detect if we're in a remote session (SSH, cloud shell, etc.).
 */
export function isRemoteSession(): boolean {
  if (process.env.SSH_CLIENT || process.env.SSH_TTY) return true

  const remoteVars = [
    'CLOUD_SHELL',
    'CODESPACES',
    'CODESPACE_NAME',
    'GITPOD_WORKSPACE_ID',
    'REPL_ID',
    'STACKBLITZ'
  ]
  return remoteVars.some(v => process.env[v])
}

/**
 * Open a URL in the default browser. Returns false if it can't.
 */
export function openBrowser(url: string): boolean {
  if (isRemoteSession()) return false
  try {
    const currentPlatform = platform()
    if (currentPlatform === 'darwin') {
      execSync(`open "${url}"`)
    } else if (currentPlatform === 'win32') {
      execSync(`start "" "${url}"`)
    } else {
      execSync(`xdg-open "${url}"`)
    }
    return true
  } catch {
    return false
  }
}

/**
 * Sleep for a number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
