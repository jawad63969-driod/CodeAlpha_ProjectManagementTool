import { ErrorCode, type FieldIssue } from '@taskforge/shared';

/**
 * The only error type the HTTP layer knows how to render. Services throw these;
 * the error middleware turns them into the uniform envelope from ARCHITECTURE §8.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: FieldIssue[];
  readonly meta?: Record<string, unknown>;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    options?: { details?: FieldIssue[]; meta?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (options?.details) this.details = options.details;
    if (options?.meta) this.meta = options.meta;
  }

  static validation(message = 'Validation failed', details?: FieldIssue[]) {
    return new AppError(400, ErrorCode.VALIDATION_FAILED, message, details ? { details } : undefined);
  }
  static unauthenticated(message = 'Authentication required') {
    return new AppError(401, ErrorCode.UNAUTHENTICATED, message);
  }
  static invalidCredentials(message = 'Email or password is incorrect') {
    return new AppError(401, ErrorCode.INVALID_CREDENTIALS, message);
  }
  static sessionExpired(message = 'Your session has expired, please sign in again') {
    return new AppError(401, ErrorCode.SESSION_EXPIRED, message);
  }
  static tokenReuse(message = 'This session was revoked for security reasons') {
    return new AppError(401, ErrorCode.TOKEN_REUSE_DETECTED, message);
  }
  static forbidden(message = 'You do not have permission to do that') {
    return new AppError(403, ErrorCode.FORBIDDEN, message);
  }
  /**
   * Used for genuinely missing resources AND for resources in another tenant —
   * refusing to confirm existence is the point (NFR-08).
   */
  static notFound(message = 'Not found') {
    return new AppError(404, ErrorCode.NOT_FOUND, message);
  }
  static conflict(message = 'That conflicts with something that already exists') {
    return new AppError(409, ErrorCode.CONFLICT, message);
  }
  static versionConflict(message = 'Someone else changed this first', current?: unknown) {
    return new AppError(409, ErrorCode.VERSION_CONFLICT, message, current ? { meta: { current } } : undefined);
  }
  static unprocessable(message: string, details?: FieldIssue[]) {
    return new AppError(422, ErrorCode.UNPROCESSABLE, message, details ? { details } : undefined);
  }
  static tooLarge(message = 'That file is too large') {
    return new AppError(413, ErrorCode.PAYLOAD_TOO_LARGE, message);
  }
  static internal(message = 'Something went wrong on our side', cause?: unknown) {
    return new AppError(500, ErrorCode.INTERNAL, message, cause ? { cause } : undefined);
  }
}

export const isAppError = (value: unknown): value is AppError => value instanceof AppError;
