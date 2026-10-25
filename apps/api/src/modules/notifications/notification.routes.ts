import { Router, type Request, type Response } from 'express';
import { paginationQuerySchema } from '@taskforge/shared';
import { handler } from '../../core/async.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { parseOrThrow } from '../../middleware/validate.js';
import { notificationService } from './notification.service.js';

export const notificationRouter = Router();

notificationRouter.get(
  '/notifications',
  authenticate,
  handler(async (req: Request, res: Response) => {
    const { limit, cursor } = parseOrThrow(paginationQuerySchema, req.query);
    const unreadOnly = req.query['unread'] === 'true';
    res.json(notificationService.list(requireAuth(req), limit, cursor ?? null, unreadOnly));
  }),
);

notificationRouter.patch(
  '/notifications/:notificationId/read',
  authenticate,
  handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    notificationService.markRead(auth, req.params['notificationId'] as string);
    res.json({ ok: true, unread: notificationService.unreadCount(auth) });
  }),
);

notificationRouter.post(
  '/notifications/read-all',
  authenticate,
  handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const marked = notificationService.markAllRead(auth);
    res.json({ ok: true, marked, unread: 0 });
  }),
);
