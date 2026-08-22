// ── Perfect Error Handling Middleware ───────────────────────────────
import type { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  details?: any;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational || false;

  // Log all errors
  console.error(`[${new Date().toISOString()}] Error:`, {
    message: err.message,
    statusCode,
    isOperational,
    stack: err.stack,
    details: err.details
  });

  // Increment error counter
  if (!global.errorCount) global.errorCount = 0;
  global.errorCount++;

  // Send error response
  const response = {
    error: {
      message: isOperational ? err.message : 'Internal server error',
      statusCode,
      timestamp: new Date().toISOString(),
      ...(isOperational && err.details ? { details: err.details } : {})
    }
  };

  // Don't include stack trace in production
  if (process.env.NODE_ENV === 'development') {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    error: {
      message: 'Resource not found',
      statusCode: 404,
      timestamp: new Date().toISOString()
    }
  });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export class ApiError extends Error implements AppError {
  statusCode: number;
  isOperational: boolean;
  details?: any;

  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 400, details);
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication required') {
    super(message, 401);
  }
}

export class AuthorizationError extends ApiError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(message, 409);
  }
}

export class RateLimitError extends ApiError {
  constructor() {
    super('Rate limit exceeded, please try again later', 429);
  }
}