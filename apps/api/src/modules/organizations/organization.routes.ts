import { Router } from 'express';
import { z } from 'zod';
import {
  Permission,
  addOrgMemberSchema,
  updateOrgMemberRoleSchema,
  updateOrganizationSchema,
} from '@taskforge/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { authorize } from '../../rbac/authorize.js';
import { organizationController } from './organization.controller.js';

const setStatusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) });

export const organizationRouter = Router();

organizationRouter.get(
  '/organization',
  authenticate,
  authorize(Permission.ORG_READ),
  organizationController.current,
);

organizationRouter.patch(
  '/organization',
  authenticate,
  authorize(Permission.ORG_UPDATE),
  validate(updateOrganizationSchema),
  organizationController.rename,
);

organizationRouter.get(
  '/organization/members',
  authenticate,
  authorize(Permission.ORG_MEMBER_READ),
  organizationController.listMembers,
);

organizationRouter.post(
  '/organization/members',
  authenticate,
  authorize(Permission.ORG_MEMBER_ADD),
  validate(addOrgMemberSchema),
  organizationController.addMember,
);

organizationRouter.patch(
  '/organization/members/:userId/role',
  authenticate,
  authorize(Permission.ORG_MEMBER_ROLE_UPDATE),
  validate(updateOrgMemberRoleSchema),
  organizationController.updateRole,
);

organizationRouter.patch(
  '/organization/members/:userId/status',
  authenticate,
  authorize(Permission.ORG_MEMBER_ROLE_UPDATE),
  validate(setStatusSchema),
  organizationController.setStatus,
);

organizationRouter.delete(
  '/organization/members/:userId',
  authenticate,
  authorize(Permission.ORG_MEMBER_REMOVE),
  organizationController.removeMember,
);
