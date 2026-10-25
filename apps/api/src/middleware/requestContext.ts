import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../core/logger.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      log: typeof logger;
      startedAt: number;
    }
  }
}

/**
 * Attaches a correlation id and a request-scoped logger, then logs one
 * completion line per request (NFR-13). Accepts an upstream X-Request-Id so a
 * trace survives a reverse proxy.
 */
export const requestContext = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.get('x-request-id');
  req.requestId = incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();
  req.startedAt = Date.now();
  req.log = logger.child({ requestId: req.requestId });
  res.setHeader('X-Request-Id', req.requestId);

  res.on('finish', () => {
    req.log.info(
      {
        method: req.method,
        route: req.route?.path ?? req.path,
        status: res.statusCode,
        durationMs: Date.now() - req.startedAt,
        userId: req.auth?.userId,
        orgId: req.auth?.organizationId,
      },
      'request completed',
    );
  });

  next();
};
