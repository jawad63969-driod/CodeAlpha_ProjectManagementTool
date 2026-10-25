import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 5 forwards rejected promises on its own, but wrapping keeps the
 * behaviour explicit and independent of that (it is the one Express behaviour
 * people most often get wrong when porting from 4).
 */
export const handler =
  <T>(fn: (req: Request, res: Response, next: NextFunction) => Promise<T>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
