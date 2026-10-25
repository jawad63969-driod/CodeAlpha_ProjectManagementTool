import { Router } from 'express';
import {
  Permission,
  addProjectMemberSchema,
  createProjectSchema,
  updateProjectMemberSchema,
  updateProjectSchema,
} from '@taskforge/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { authorize, fromParams } from '../../rbac/authorize.js';
import { projectController } from './project.controller.js';

const inProject = fromParams('projectId');

export const projectRouter = Router();

projectRouter.get('/projects', authenticate, projectController.list);

projectRouter.post(
  '/projects',
  authenticate,
  authorize(Permission.PROJECT_CREATE),
  validate(createProjectSchema),
  projectController.create,
);

projectRouter.get(
  '/projects/:projectId',
  authenticate,
  authorize(Permission.PROJECT_READ, inProject),
  projectController.get,
);

projectRouter.patch(
  '/projects/:projectId',
  authenticate,
  authorize(Permission.PROJECT_UPDATE, inProject),
  validate(updateProjectSchema),
  projectController.update,
);

projectRouter.delete(
  '/projects/:projectId',
  authenticate,
  authorize(Permission.PROJECT_DELETE, inProject),
  projectController.remove,
);

projectRouter.get(
  '/projects/:projectId/members',
  authenticate,
  authorize(Permission.PROJECT_READ, inProject),
  projectController.listMembers,
);

projectRouter.post(
  '/projects/:projectId/members',
  authenticate,
  authorize(Permission.PROJECT_MEMBER_MANAGE, inProject),
  validate(addProjectMemberSchema),
  projectController.addMember,
);

projectRouter.patch(
  '/projects/:projectId/members/:userId',
  authenticate,
  authorize(Permission.PROJECT_MEMBER_MANAGE, inProject),
  validate(updateProjectMemberSchema),
  projectController.updateMember,
);

projectRouter.delete(
  '/projects/:projectId/members/:userId',
  authenticate,
  authorize(Permission.PROJECT_MEMBER_MANAGE, inProject),
  projectController.removeMember,
);
