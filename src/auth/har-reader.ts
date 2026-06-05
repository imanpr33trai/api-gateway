import type { Har } from 'har-format'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const HAR_SEARCH_PATHS = [
  // join(homedir(), '.g4f', 'cookies', 'har'),
  // join(homedir(), 'Downloads'),
  // join(
  //   homedir(),
  //   'Documents',
  //   'api-gateway',
  //   'har',)
  join(homedir(), 'Documents', 'api-gateway')
]

export const loadHar = async (path: string): Promise<Har> => {
  const file = Bun.file(path)
  const data = await file.json()
  return data
}

export const extractCookiesFromHar = async (
  harPath: string,
  domainFilter: string
): Promise<Record<string, string>> => {
  const har = await loadHar(harPath)
  const cookies: Record<string, string> = {}
  for (const entry of har.log.entries) {
    if (!entry.request.url.includes(domainFilter)) continue

    for (const cookie of entry.request.cookies) {
      cookies[cookie.name] = cookie.value
    }
    for (const header of entry.response.headers) {
      if (header.name.toLowerCase() === 'set-cookie') {
        const parts = header.value.split(';')[0]?.split('=') // Split on semicolon to get the cookie name=value part
        if (parts && parts.length >= 2) {
          const cookieName = parts[0]?.trim()
          if (cookieName) {
            const cookieValue = parts.slice(1).join('=').trim()
            cookies[cookieName] = cookieValue
          }
        }
      }
    }
  }
  return cookies
}

export async function extractHeadersFromHar(
  harPath: string,
  urlPattern: RegExp
): Promise<Record<string, string>> {
  const har = await loadHar(harPath)
  const headers: Record<string, string> = {}

  for (const entry of har.log.entries) {
    if (!urlPattern.test(entry.request.url)) continue

    for (const header of entry.request.headers) {
      const lower = header.name.toLowerCase()
      if (
        lower.startsWith('authorization') ||
        lower.startsWith('x-') ||
        lower.startsWith('cookie')
      ) {
        headers[header.name] = header.value
      }
    }
  }
  return headers
}

export async function extractTokensFromHar(
  harPath: string,
  urlPattern: RegExp
): Promise<string | null> {
  const headers = await extractHeadersFromHar(harPath, urlPattern)
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'authorization') {
      return value.replace(/^Bearer\s+/i, '').trim()
    }
  }
  return null
}

export const findHarFile = (providerName: string): string | null => {
  for (const dir of HAR_SEARCH_PATHS) {
    if (!existsSync(dir)) continue
    try {
      const files = readdirSync(dir)
      for (const file of files) {
        if (
          file.toLowerCase().includes(providerName.toLowerCase()) &&
          file.endsWith('har')
        ) {
          return join(dir, file)
        }
      }
    } catch {
      continue
    }
  }
  return null
}

export const listHarFiles = (): string[] => {
  const files: string[] = []
  for (const dir of HAR_SEARCH_PATHS) {
    if (!existsSync(dir)) continue
    try {
      for (const file of readdirSync(dir)) {
        if (file.endsWith('.har')) {
          files.push(join(dir, file))
        }
      }
    } catch {
      continue
    }
  }
  return files
}
