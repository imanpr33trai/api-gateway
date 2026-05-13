import type { Context, Next } from 'hono'

import { isAppError } from '../types'
import { handleErrorResponse } from '../utils/errorHandler'

export async function errorHandlingMiddleware(c: Context, next: Next) {
  try {
    await next()
  } catch (error: Error) {
    console.error('Error caught in middleware:', error)

    // Use the global error handler
    const errorResponse = handleErrorResponse(error)

    // Return appropriate status code based on error type
    let statusCode = 500
    if (isAppError(error)) {
      switch (error.code) {
        case 'VALIDATION_ERROR':
          statusCode = 400
          break
        case 'AUTH_ERROR':
          statusCode = 401
          break
        case 'FORBIDDEN_ERROR':
          statusCode = 403
          break
        case 'NOT_FOUND_ERROR':
          statusCode = 404
          break
        default:
          statusCode = 500
      }
    }

    return c.json({ errorResponse, statusCode })
  }
}
