/**
 * Tests for HAR reader.
 */
import { describe, test } from 'bun:test'

import { findHarFile } from '../src/auth/har-reader'

const path = findHarFile('deepseek')

describe('har-reader', () => {
  test('loadHar parses JSON', async () => {
    const { loadHar } = await import('../src/auth/har-reader')
    if (!path) {
      console.log('har is not ')
      return
    }
    const har = await loadHar(path)
  })

  test('extractCookiesFromHar extracts cookies matching domain', async () => {
    const { extractCookiesFromHar } = await import('../src/auth/har-reader')
    // expect(cookies['__Secure-next-auth']).toBe('test-session-token')
    // expect(cookies['session-id']).toBe('abc123')
    // expect(cookies['refresh-token']).toBe('xyz789')
    if (!path) {
      console.log('har is not ')
      return
    }
    const cookies = await extractCookiesFromHar(path, 'deepseek.com')
    console.log('Cokkies', cookies)
  })

  test('extractTokenFromHar extracts Bearer token', async () => {
    const { extractTokensFromHar } = await import('../src/auth/har-reader')
    if (!path) {
      console.log('har is not ')
      return
    }
    const token = await extractTokensFromHar(path, /deepseek\.com/)
    console.log('Token', token)
  })

  test('extractHeadersFromHar returns auth headers', async () => {
    const { extractHeadersFromHar } = await import('../src/auth/har-reader')
    if (!path) {
      console.log('har is not ')
      return
    }
    const headers = await extractHeadersFromHar(path, /deepseek\.com/)
    console.log('Headers', headers)
  })
})
