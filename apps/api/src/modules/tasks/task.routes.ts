import { Router } from 'express';
import { Permission, createTaskSchema, moveTaskSchema, updateTaskSchema } from '@taskforge/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { authorize, fromParams, fromTask } from '../../rbac/authorize.js';
import { taskController } from './task.controller.js';

const inProject = fromParams('projectId');
const ofTask = fromTask();

export const taskRouter = Router();

// Declared before `/tasks/:taskId` so "mine" is never read as an id.
taskRouter.get('/tasks/mine', authenticate, taskController.mine);

taskRouter.post(
  '/projects/:projectId/tasks',
  authenticate,
  authorize(Permission.TASK_CREATE, inProject),
  validate(createTaskSchema),
  taskController.create,
);

taskRouter.get('/tasks/:taskId', authenticate, authorize(Permission.PROJECT_READ, ofTask), taskController.get);
taskRouter.get('/tasks/:taskId/subtasks', authenticate, authorize(Permission.PROJECT_READ, ofTask), taskController.subtasks);

taskRouter.patch(
  '/tasks/:taskId',
  authenticate,
  authorize(Permission.TASK_UPDATE, ofTask),
  validate(updateTaskSchema),
  taskController.update,
);

taskRouter.post(
  '/tasks/:taskId/move',
  authenticate,
  authorize(Permission.TASK_MOVE, ofTask),
  validate(moveTaskSchema),
  taskController.move,
);

taskRouter.delete('/tasks/:taskId', authenticate, authorize(Permission.TASK_DELETE, ofTask), taskController.remove);

taskRouter.post('/tasks/:taskId/watch', authenticate, authorize(Permission.PROJECT_READ, ofTask), taskController.watch);
taskRouter.delete('/tasks/:taskId/watch', authenticate, authorize(Permission.PROJECT_READ, ofTask), taskController.watch);
