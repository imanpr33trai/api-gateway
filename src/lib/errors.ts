/**
 * Error Handling Utilities — type-safe error wrapping and logging.
 *
 * Provides:
 * - trySync / tryAsync — wrap operations returning [result, error] tuples
 * - logError — consistent error logging with context
 * - rethrow — wrap and rethrow with context
 */

// ─── Result tuple pattern ──────────────────────────────────────────

export type Result<T> = [T, null] | [null, Error]

/**
 * Wrap a sync function that might throw.
 * Returns [result, null] on success, [null, Error] on failure.
 *
 * ```ts
 * const [data, err] = trySync(() => JSON.parse(raw));
 * if (err) return c.json({ error: err.message }, 400);
 * // data is typed here
 * ```
 */
export function trySync<T>(fn: () => T): Result<T> {
  try {
    return [fn(), null]
  } catch (err) {
    return [null, err instanceof Error ? err : new Error(String(err))]
  }
}

/**
 * Wrap an async function that might throw.
 * Returns [result, null] on success, [null, Error] on failure.
 *
 * ```ts
 * const [data, err] = await tryAsync(() => db.select().from(users));
 * if (err) return handleError(c, err);
 * ```
 */
export async function tryAsync<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return [await fn(), null]
  } catch (err) {
    return [null, err instanceof Error ? err : new Error(String(err))]
  }
}

// ─── Contextual error logging ──────────────────────────────────────

const PREFIX = '[ts-provider-oauth]'

/**
 * Log an error with structured context.
 *
 * ```ts
 * logError("fetchModels", err, { provider: "opencode-zen" });
 * // → [ts-provider-oauth] fetchModels: timeout (provider=opencode-zen)
 * ```
 */
export function logError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const message = error instanceof Error ? error.message : String(error)
  const suffix = extra ? ` (${formatExtra(extra)})` : ''
  console.error(`${PREFIX} ${context}: ${message}${suffix}`)
}

function formatExtra(extra: Record<string, unknown>): string {
  return Object.entries(extra)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')
}

/**
 * Wrap a caught error with context and rethrow as an Error with a
 * descriptive message that preserves the original error chain.
 *
 * ```ts
 * catch (err) {
 *   throw rethrow(err, "Failed to fetch models", { provider });
 * }
 * ```
 */
export function rethrow(
  error: unknown,
  context: string,
  extra?: Record<string, unknown>
): never {
  const message = error instanceof Error ? error.message : String(error)
  const suffix = extra ? ` (${formatExtra(extra)})` : ''
  const wrapped = new Error(`${context}: ${message}${suffix}`)
  if (error instanceof Error && error.stack) {
    wrapped.stack = `${wrapped.stack}\nCaused by: ${error.stack}`
  }
  throw wrapped
}

/**
 * Noop catch — logs the error and continues.
 * Use for non-critical background operations that shouldn't crash.
 *
 * ```ts
 * catch (err) { noopCatch(err, "refreshToken", { provider }); }
 * ```
 */
export function noopCatch(
  error: unknown,
  context: string,
  extra?: Record<string, unknown>
): void {
  logError(context, error, extra)
}
