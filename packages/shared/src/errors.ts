/**
 * Stable, machine-readable error codes. Clients branch on `code`, never on the
 * human-readable message — messages are free to change, codes are a contract.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  TOKEN_REUSE_DETECTED: 'TOKEN_REUSE_DETECTED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNPROCESSABLE: 'UNPROCESSABLE',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface FieldIssue {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: FieldIssue[];
    /** Present on every response; quote it when reporting a problem. */
    requestId: string;
  };
}
