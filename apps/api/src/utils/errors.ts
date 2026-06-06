/**
 * Custom error classes for the DealerOS API.
 *
 * Each class maps cleanly to an HTTP status code in the global error handler.
 * Always prefer these over raw Error so the response shape is consistent.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: unknown;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

export class AuthError extends AppError {
  constructor(message = "Authentication required", details?: unknown) {
    super(message, 401, "UNAUTHORIZED", details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", details?: unknown) {
    super(message, 403, "FORBIDDEN", details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", details?: unknown) {
    super(message, 404, "NOT_FOUND", details);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource conflict", details?: unknown) {
    super(message, 409, "CONFLICT", details);
  }
}

/**
 * PaymentRequiredError — 402. Thrown when a dealer exceeds a plan
 * limit (e.g. tried to create the 4th user on Starter). The body
 * carries a `details.code` of `PLAN_LIMIT_EXCEEDED` so the client
 * can render a tailored "Upgrade required" prompt.
 */
export class PaymentRequiredError extends AppError {
  constructor(message = "Plan limit exceeded", details?: unknown) {
    super(message, 402, "PLAN_LIMIT_EXCEEDED", details);
  }
}

export class ServerError extends AppError {
  constructor(message = "Internal server error", details?: unknown) {
    super(message, 500, "SERVER_ERROR", details);
  }
}
