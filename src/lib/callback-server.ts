/**
 * Start an ephemeral localhost HTTP server to receive the OAuth callback.
 * Returns a promise that resolves when the callback is received with the code.
 */

export interface CallbackResult {
  code: string
  state: string
  error?: string
}

export function startCallbackServer(
  host: string,
  port: number,
  path: string,
  timeoutMs: number
): Promise<{ result: CallbackResult; close: () => void }> {
  return new Promise(resolve => {
    const server = Bun.serve({
      hostname: host,
      port,
      async fetch(req) {
        const url = new URL(req.url)

        if (url.pathname === path || url.pathname === `${path}/`) {
          const code = url.searchParams.get('code') ?? ''
          const state =
            url.searchParams.get('state') ??
            url.searchParams.get('session_state') ??
            ''
          const error = url.searchParams.get('error') ?? undefined

          clearTimeout(timer)
          resolve({
            result: { code, state, error },
            close: () => {
              try {
                server.stop()
              } catch {
                /* ignore */
              }
            }
          })

          return new Response(
            `<!DOCTYPE html><html><head><title>Auth Complete</title></head>
<body style="font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;">
<div style="background:white;padding:2rem;border-radius:8px;text-align:center;">
<h2>Authorization Complete</h2><p>You may close this window.</p></div></body></html>`,
            { headers: { 'Content-Type': 'text/html' } }
          )
        }
        return new Response('Not found', { status: 404 })
      },
      error(err) {
        clearTimeout(timer)
        resolve({
          result: { code: '', state: '', error: err.message },
          close: () => {}
        })
      }
    })

    const timer = setTimeout(() => {
      try {
        server.stop()
      } catch {
        /* ignore */
      }
      resolve({
        result: { code: '', state: '', error: 'Callback server timed out' },
        close: () => {}
      })
    }, timeoutMs)
  })
}

/** Find an available port. */
export async function findAvailablePort(
  preferredPort: number
): Promise<number> {
  try {
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: preferredPort,
      fetch() {
        return new Response('OK')
      }
    })
    server.stop()
    return preferredPort
  } catch {
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch() {
        return new Response('OK')
      }
    })
    const p = server.port ?? 0
    server.stop()
    return p
  }
}
