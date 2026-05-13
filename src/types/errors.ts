// src/types/errors.ts
// Application error types

// Define specific error types for your application
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, details)
    this.name = 'ValidationError'
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('DATABASE_ERROR', message, details)
    this.name = 'DatabaseError'
  }
}

export class NetworkError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('NETWORK_ERROR', message, details)
    this.name = 'NetworkError'
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('AUTH_ERROR', message, details)
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('FORBIDDEN_ERROR', message, details)
    this.name = 'AuthorizationError'
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('NOT_FOUND_ERROR', message, details)
    this.name = 'NotFoundError'
  }
}

export class ApiError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('API_ERROR', message, details)
    this.name = 'ApiError'
  }
}

export class StreamError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('STREAM_ERROR', message, details)
    this.name = 'StreamingError'
  }
}

// Type guard to check if an error is an AppError
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
