import { Router, type Request, type Response } from 'express';
import { Permission, paginationQuerySchema } from '@taskforge/shared';
import { handler } from '../../core/async.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { parseOrThrow } from '../../middleware/validate.js';
import { authorize, fromParams, fromTask } from '../../rbac/authorize.js';
import { activityService } from './activity.service.js';

export const activityRouter = Router();

activityRouter.get(
  '/projects/:projectId/activity',
  authenticate,
  authorize(Permission.PROJECT_READ, fromParams('projectId')),
  handler(async (req: Request, res: Response) => {
    const { limit, cursor } = parseOrThrow(paginationQuerySchema, req.query);
    res.json(activityService.forProject(requireAuth(req), req.params['projectId'] as string, limit, cursor ?? null));
  }),
);

activityRouter.get(
  '/tasks/:taskId/activity',
  authenticate,
  authorize(Permission.PROJECT_READ, fromTask()),
  handler(async (req: Request, res: Response) => {
    const { limit, cursor } = parseOrThrow(paginationQuerySchema, req.query);
    res.json(activityService.forTask(requireAuth(req), req.params['taskId'] as string, limit, cursor ?? null));
  }),
);

activityRouter.get(
  '/activity',
  authenticate,
  authorize(Permission.ORG_ACTIVITY_READ),
  handler(async (req: Request, res: Response) => {
    const { limit, cursor } = parseOrThrow(paginationQuerySchema, req.query);
    res.json(activityService.forOrganization(requireAuth(req), limit, cursor ?? null));
  }),
);
