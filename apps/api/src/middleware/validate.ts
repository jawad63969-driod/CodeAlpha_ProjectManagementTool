import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import type { FieldIssue } from '@taskforge/shared';
import { AppError } from '../core/errors.js';

type Source = 'body' | 'query' | 'params';

const toIssues = (error: { issues: Array<{ path: PropertyKey[]; message: string }> }): FieldIssue[] =>
  error.issues.map((issue) => ({
    field: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }));

/**
 * Parses one part of the request with a Zod schema and REPLACES it with the
 * parsed value, so downstream code sees coerced, defaulted, trimmed data and
 * can never accidentally read the raw input (NFR-05).
 */
export const validate =
  <T>(schema: ZodType<T>, source: Source = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(AppError.validation('Validation failed', toIssues(result.error)));
      return;
    }
    // req.query is a getter in Express 5, so assign through defineProperty.
    if (source === 'query') {
      Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
    } else {
      req[source] = result.data as never;
    }
    next();
  };

/** Parses a value outside the middleware chain (services, socket payloads). */
export const parseOrThrow = <T>(schema: ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw AppError.validation('Validation failed', toIssues(result.error));
  return result.data;
};
