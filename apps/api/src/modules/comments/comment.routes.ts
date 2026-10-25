import { Router, type Request, type Response } from 'express';
import { Permission, createCommentSchema, updateCommentSchema } from '@taskforge/shared';
import { handler } from '../../core/async.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { authorize, fromComment, fromTask } from '../../rbac/authorize.js';
import { commentService } from './comment.service.js';

const ofTask = fromTask();
const ofComment = fromComment();

export const commentRouter = Router();

commentRouter.get(
  '/tasks/:taskId/comments',
  authenticate,
  authorize(Permission.PROJECT_READ, ofTask),
  handler(async (req: Request, res: Response) => {
    res.json({ comments: commentService.list(requireAuth(req), req.params['taskId'] as string) });
  }),
);

commentRouter.post(
  '/tasks/:taskId/comments',
  authenticate,
  authorize(Permission.COMMENT_CREATE, ofTask),
  validate(createCommentSchema),
  handler(async (req: Request, res: Response) => {
    const comment = commentService.create(requireAuth(req), req.params['taskId'] as string, req.body);
    res.status(201).json({ comment });
  }),
);

commentRouter.patch(
  '/comments/:commentId',
  authenticate,
  authorize(Permission.COMMENT_UPDATE_OWN, ofComment),
  validate(updateCommentSchema),
  handler(async (req: Request, res: Response) => {
    res.json({ comment: commentService.update(requireAuth(req), req.params['commentId'] as string, req.body) });
  }),
);

commentRouter.delete(
  '/comments/:commentId',
  authenticate,
  authorize(Permission.COMMENT_CREATE, ofComment),
  handler(async (req: Request, res: Response) => {
    commentService.remove(requireAuth(req), req.params['commentId'] as string);
    res.json({ ok: true });
  }),
);
