import { z } from 'zod'
import { AppError, isAppError } from '../types'

// Error handler for async operations
export async function handleAsync<T>(
  promise: Promise<T>
): Promise<[T, null] | [null, AppError]> {
  try {
    const data = await promise
    return [data, null]
  } catch (error: unknown) {
    if (isAppError(error)) {
      return [null, error]
    }

    // Handle ZodError specially
    if (error instanceof z.ZodError) {
      return [null, new AppError('VALIDATION_ERROR', error.message, { issues: error.issues })]
    }

    // Otherwise, wrap it in a generic AppError
    const message = error instanceof Error ? error.message : 'An unknown error occurred'
    return [null, new AppError('UNKNOWN_ERROR', message, { originalError: error })]
  }
}

// Error handler for sync operations
export function handleSync<T>(fn: () => T): [T, null] | [null, AppError] {
  try {
    const data = fn()
    return [data, null]
  } catch (error: unknown) {
    // If it's already an AppError, return it as-is
    if (isAppError(error)) {
      return [null, error]
    }

    // Handle ZodError specially
    if (error instanceof z.ZodError) {
      return [null, new AppError('VALIDATION_ERROR', error.message, { issues: error.issues })]
    }

    // Otherwise, wrap it in a generic AppError
    const message = error instanceof Error ? error.message : 'An unknown error occurred'
    return [null, new AppError('UNKNOWN_ERROR', message, { originalError: error })]
  }
}

// Global error response handler for Hono
export function handleErrorResponse(error: unknown) {
  // If it's already an AppError, use its properties
  if (isAppError(error)) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details && { details: error.details })
      }
    }
  }

  // For unexpected errors, create a generic error response
  const message = error instanceof Error ? error.message : 'An unexpected error occurred'
  return {
    success: false,
    error: {
      code: 'UNKNOWN_ERROR',
      message
    }
  }
}
