import type { NextFunction, Request, Response } from 'express';
import { ErrorCode, type ApiErrorBody } from '@taskforge/shared';
import { AppError, isAppError } from '../core/errors.js';
import { env } from '../config/env.js';

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(AppError.notFound(`No route matches ${req.method} ${req.originalUrl}`));
};

/** The single place an error becomes an HTTP response. */
export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const appError = normalise(err);

  if (appError.status >= 500) {
    req.log?.error({ err, code: appError.code }, 'unhandled error');
  } else {
    req.log?.warn({ code: appError.code, status: appError.status, msg: appError.message }, 'request rejected');
  }

  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message:
        appError.status >= 500 && env.isProduction
          ? 'Something went wrong on our side'
          : appError.message,
      requestId: req.requestId ?? 'unknown',
      ...(appError.details ? { details: appError.details } : {}),
    },
  };

  // Extra context (for example the current state on a version conflict) sits
  // BESIDE the error, so the envelope shape in ARCHITECTURE §8 stays exact.
  res.status(appError.status).json(appError.meta ? { ...body, ...appError.meta } : body);
};

const normalise = (err: unknown): AppError => {
  if (isAppError(err)) return err;

  if (err && typeof err === 'object') {
    const candidate = err as { type?: string; code?: string; status?: number; message?: string };
    // Multer's size guard
    if (candidate.code === 'LIMIT_FILE_SIZE') return AppError.tooLarge();
    // express.json() body parser failures
    if (candidate.type === 'entity.too.large') return AppError.tooLarge('Request body is too large');
    if (candidate.type === 'entity.parse.failed') return AppError.validation('Request body is not valid JSON');
  }

  return new AppError(
    500,
    ErrorCode.INTERNAL,
    err instanceof Error ? err.message : 'Unexpected error',
    { cause: err },
  );
};
