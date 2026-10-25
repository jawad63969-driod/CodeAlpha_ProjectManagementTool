import { z } from 'zod';
import { idSchema } from './common.js';
import { STATUS_CATEGORIES } from '../domain.js';

export const createStatusSchema = z.object({
  name: z.string().trim().min(1).max(40),
  category: z.enum(STATUS_CATEGORIES as [string, ...string[]]),
});

export const createColumnSchema = z.object({
  name: z.string().trim().min(1, 'Column needs a name').max(40),
  statusId: idSchema.optional(),
  /** When no status is supplied, one is created with this category. */
  category: z.enum(STATUS_CATEGORIES as [string, ...string[]]).default('TODO'),
  wipLimit: z.number().int().min(1).max(99).nullable().optional(),
});

export const updateColumnSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  wipLimit: z.number().int().min(1).max(99).nullable().optional(),
});

export const reorderColumnsSchema = z.object({
  orderedColumnIds: z.array(idSchema).min(1),
});

export const createBoardSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export type CreateColumnInput = z.infer<typeof createColumnSchema>;
export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;
