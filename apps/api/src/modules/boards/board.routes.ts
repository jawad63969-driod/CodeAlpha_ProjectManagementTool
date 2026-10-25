import { Router } from 'express';
import {
  Permission,
  createBoardSchema,
  createColumnSchema,
  createLabelSchema,
  reorderColumnsSchema,
  updateColumnSchema,
} from '@taskforge/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { authorize, fromColumn, fromParams } from '../../rbac/authorize.js';
import { boardController } from './board.controller.js';

const inProject = fromParams('projectId');

export const boardRouter = Router();

boardRouter.get('/projects/:projectId/board', authenticate, authorize(Permission.PROJECT_READ, inProject), boardController.snapshot);
boardRouter.get('/projects/:projectId/boards', authenticate, authorize(Permission.PROJECT_READ, inProject), boardController.listBoards);
boardRouter.post('/projects/:projectId/boards', authenticate, authorize(Permission.BOARD_CONFIGURE, inProject), validate(createBoardSchema), boardController.createBoard);

boardRouter.get('/projects/:projectId/columns', authenticate, authorize(Permission.PROJECT_READ, inProject), boardController.listColumns);
boardRouter.post('/projects/:projectId/columns', authenticate, authorize(Permission.BOARD_CONFIGURE, inProject), validate(createColumnSchema), boardController.createColumn);
boardRouter.patch('/projects/:projectId/columns/reorder', authenticate, authorize(Permission.BOARD_CONFIGURE, inProject), validate(reorderColumnsSchema), boardController.reorderColumns);

// Column ids are globally unique, so these do not need the project in the path;
// the service resolves the owning project and re-checks the permission there.
boardRouter.patch('/columns/:columnId', authenticate, authorize(Permission.BOARD_CONFIGURE, fromColumn()), validate(updateColumnSchema), boardController.updateColumn);
boardRouter.delete('/columns/:columnId', authenticate, authorize(Permission.BOARD_CONFIGURE, fromColumn()), boardController.deleteColumn);

boardRouter.get('/projects/:projectId/labels', authenticate, authorize(Permission.PROJECT_READ, inProject), boardController.listLabels);
boardRouter.post('/projects/:projectId/labels', authenticate, authorize(Permission.BOARD_CONFIGURE, inProject), validate(createLabelSchema), boardController.createLabel);
boardRouter.delete('/projects/:projectId/labels/:labelId', authenticate, authorize(Permission.BOARD_CONFIGURE, inProject), boardController.deleteLabel);
