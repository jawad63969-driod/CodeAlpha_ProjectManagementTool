import { z } from 'zod';
import { hexColorSchema, idSchema } from './common.js';
import { PROJECT_ROLES } from '../rbac/roles.js';

export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(/^[A-Z]{2,10}$/, 'Key must be 2–10 uppercase letters'));

export const createProjectSchema = z.object({
  name: z.string().trim().min(2, 'Project name must be at least 2 characters').max(120),
  key: projectKeySchema.optional(),
  description: z.string().trim().max(2000).default(''),
  color: hexColorSchema.default('#6366f1'),
  leadId: idSchema.nullable().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  color: hexColorSchema.optional(),
  leadId: idSchema.nullable().optional(),
  archived: z.boolean().optional(),
});

export const addProjectMemberSchema = z.object({
  userId: idSchema,
  role: z.enum(PROJECT_ROLES as [string, ...string[]]).default('DEVELOPER'),
});

export const updateProjectMemberSchema = z.object({
  role: z.enum(PROJECT_ROLES as [string, ...string[]]),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
