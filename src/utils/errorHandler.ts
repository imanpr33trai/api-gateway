import { AppError, isAppError } from '../types'

// Error handler for async operations
export async function handleAsync<T>(
  promise: Promise<T>
): Promise<[T, null] | [null, AppError]> {
  try {
    const data = await promise
    return [data, null]
  } catch (error: Error | AppError) {
    // If it's already an AppError, return it as-is
    if (isAppError(error)) {
      return [null, error]
    }

    // Otherwise, wrap it in a generic AppError
    const appError = new AppError(
      'UNKNOWN_ERROR',
      error.message || 'An unknown error occurred',
      { originalError: error }
    )

    return [null, appError]
  }
}

// Error handler for sync operations
export function handleSync<T>(fn: () => T): [T, null] | [null, AppError] {
  try {
    const data = fn()
    return [data, null]
  } catch (error: Error | AppError) {
    // If it's already an AppError, return it as-is
    if (isAppError(error)) {
      return [null, error]
    }

    // Otherwise, wrap it in a generic AppError
    const appError = new AppError(
      'UNKNOWN_ERROR',
      error.message || 'An unknown error occurred',
      { originalError: error }
    )

    return [null, appError]
  }
}

// Global error response handler for Hono
export function handleErrorResponse(error: Error | AppError) {
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
  return {
    success: false,
    error: {
      code: 'UNKNOWN_ERROR',
      message: error.message || 'An unexpected error occurred'
    }
  }
}
