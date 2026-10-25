import { z } from 'zod';
import { emailSchema } from './common.js';
import { ORG_ROLES } from '../rbac/roles.js';

const assignableOrgRoles = ORG_ROLES.filter((r) => r !== 'OWNER') as [string, ...string[]];

export const addOrgMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(assignableOrgRoles).default('MEMBER'),
});

export const updateOrgMemberRoleSchema = z.object({
  role: z.enum(assignableOrgRoles),
});

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export type AddOrgMemberInput = z.infer<typeof addOrgMemberSchema>;
export type UpdateOrgMemberRoleInput = z.infer<typeof updateOrgMemberRoleSchema>;
