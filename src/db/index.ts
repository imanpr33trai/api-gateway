/**
 * Database Client — PostgreSQL via Drizzle with graceful in-memory fallback.
 *
 * If the PostgreSQL connection fails (DB unavailable, wrong credentials, etc.),
 * all operations silently fall back to a chainable no-op that resolves to
 * empty results. A warning is logged on first fallback and the system retries
 * the DB connection every 60 seconds.
 *
 * The chainable no-op properly handles Drizzle's method-chaining pattern:
 *   db.select().from(table).where(eq(col, val)).limit(1)
 *
 * Each step returns another no-op, and the final `await` resolves to `[]`.
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://localhost:5432/ts_provider_oauth'

let _db: ReturnType<typeof drizzle> | null = null
let _fallbackActive = false
let _fallbackLogged = false
let _retryTimer: ReturnType<typeof setInterval> | null = null

// ─── Chainable No-Op Proxy ───────────────────────────────────────
//
// Drizzle uses method chaining:
//   const [row] = await db.select().from(t).where(eq(c,v)).limit(1);
//
// When the DB is down, each step must return an object that:
//   (a) accepts further chained calls (returning itself)
//   (b) resolves to [] when awaited (so destructuring gives undefined)

let _noopChain: any = null

function getNoopChain(): any {
  if (!_noopChain) {
    _noopChain = new Proxy(
      () => {
        /* noop */
      },
      {
        get(_target, prop, _receiver) {
          if (prop === 'then') {
            // Thenable — resolves to [] so await works
            return (resolve: (v: unknown) => void) => resolve([])
          }
          if (prop === Symbol.toPrimitive) return () => ''
          // Return the same noop for .from .where .limit etc.
          return getNoopChain()
        },
        apply(_target, _thisArg, _args) {
          // Called as function: db.select()
          return getNoopChain()
        }
      }
    )
  }
  return _noopChain
}

// ─── Client Creation ─────────────────────────────────────────────

function createClient(): ReturnType<typeof drizzle> | null {
  try {
    const queryClient = postgres(connectionString, {
      max: 5,
      idle_timeout: 30,
      connect_timeout: 5
    })
    return drizzle(queryClient, { schema })
  } catch {
    return null
  }
}

function logFallback(): void {
  if (!_fallbackLogged) {
    console.warn(
      'DB unavailable — operating in memory-only mode. Install PostgreSQL for persistence.'
    )
    _fallbackLogged = true
  }
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Get the database instance.
 * Returns null if the DB is unavailable (in-memory fallback mode).
 */
export function getDb(): ReturnType<typeof drizzle> | null {
  if (!_db && !_fallbackActive) {
    _db = createClient()
    if (!_db) {
      _fallbackActive = true
      logFallback()
      // Start retry timer
      if (!_retryTimer) {
        _retryTimer = setInterval(() => {
          const newDb = createClient()
          if (newDb) {
            _db = newDb
            _fallbackActive = false
            console.log('DB connection restored.')
            if (_retryTimer) {
              clearInterval(_retryTimer)
              _retryTimer = null
            }
          }
        }, 60_000)
      }
    }
  }
  return _db
}

/**
 * Export a proxy that returns null-safe results when DB is unavailable.
 *
 * - When the DB is available: forwards all property access and calls to
 *   the real drizzle instance (bound correctly).
 * - When the DB is unavailable: returns a chainable no-op so chained
 *   Drizzle calls (select → from → where → limit → await) don't crash.
 */
export const db = new Proxy({} as NonNullable<ReturnType<typeof drizzle>>, {
  get(_target, prop, _receiver) {
    const instance = getDb()
    if (prop === 'then') {
      // The db proxy itself should not be thenable — it's not a query
      return undefined
    }
    if (!instance) {
      logFallback()
      // Return the chainable no-op for any property access
      // (db.select, db.insert, db.update, db.delete, etc.)
      return getNoopChain()
    }
    const value = (instance as unknown as Record<string, unknown>)[
      prop as string
    ]
    if (typeof value === 'function') {
      return value.bind(instance)
    }
    return value
  }
})

export type Db = ReturnType<typeof drizzle>
