import type { Request, Response } from 'express';
import { paginationQuerySchema, type CreateTaskInput, type MoveTaskInput, type UpdateTaskInput } from '@taskforge/shared';
import { handler } from '../../core/async.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { parseOrThrow } from '../../middleware/validate.js';
import { taskService } from './task.service.js';

const taskIdOf = (req: Request): string => req.params['taskId'] as string;

export const taskController = {
  create: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const task = taskService.create(auth, req.params['projectId'] as string, req.body as CreateTaskInput);
    res.status(201).json({ task });
  }),

  get: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    res.json({ task: taskService.get(auth, taskIdOf(req)) });
  }),

  subtasks: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    res.json({ tasks: taskService.subtasks(auth, taskIdOf(req)) });
  }),

  update: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    res.json({ task: taskService.update(auth, taskIdOf(req), req.body as UpdateTaskInput) });
  }),

  move: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    res.json(taskService.move(auth, taskIdOf(req), req.body as MoveTaskInput));
  }),

  remove: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const strategy = req.query['strategy'] === 'CASCADE' ? 'CASCADE' : 'REPARENT';
    res.json({ ok: true, ...taskService.remove(auth, taskIdOf(req), strategy) });
  }),

  mine: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { limit, cursor } = parseOrThrow(paginationQuerySchema, req.query);
    res.json(taskService.listAssignedToMe(auth, limit, cursor ?? null));
  }),

  watch: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    taskService.watch(auth, taskIdOf(req), req.method === 'POST');
    res.json({ ok: true, watchers: taskService.watchers(auth, taskIdOf(req)) });
  }),
};
