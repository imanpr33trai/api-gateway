/**
 * Cryptographic utilities for OAuth: SHA256, base64url, random bytes.
 */

/**
 * Base64url-encode a buffer (no padding, replace +/ with -_).
 */
export function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCodePoint(bytes[i]!)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Generate a random string suitable as a code verifier (PKCE).
 * @param byteLength Number of random bytes (default 48 → ~64 chars base64url).
 */
export function generateCodeVerifier(byteLength = 48): string {
  const buffer = crypto.getRandomValues(new Uint8Array(byteLength))
  return base64urlEncode(buffer.buffer).slice(0, 96)
}

/**
 * Compute the S256 code challenge from a code verifier.
 */
export async function computeCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(verifier))
  return base64urlEncode(hash)
}

/**
 * Generate a random state string for CSRF protection.
 */
export function generateState(byteLength = 16): string {
  const buffer = crypto.getRandomValues(new Uint8Array(byteLength))
  return base64urlEncode(buffer.buffer)
}

/**
 * Generate a random nonce for OIDC.
 */
export function generateNonce(byteLength = 16): string {
  return generateState(byteLength)
}

/**
 * Generate a UUID v4.
 */
export function generateUUID(): string {
  return crypto.randomUUID()
}

/**
 * Compute a SHA-256 fingerprint of a token (for logging/diagnostics).
 */
export function tokenFingerprint(token: string): string {
  return token.length > 12
    ? `${token.slice(0, 4)}...${token.slice(-4)}`
    : '(short)'
}
