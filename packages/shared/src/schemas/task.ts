import { z } from 'zod';
import { idSchema, isoDateSchema, versionSchema } from './common.js';
import { TASK_PRIORITIES, TASK_TYPES } from '../domain.js';

const priority = z.enum(TASK_PRIORITIES as [string, ...string[]]);
const taskType = z.enum(TASK_TYPES as [string, ...string[]]);

export const createTaskSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(200),
  description: z.string().max(20_000).default(''),
  type: taskType.default('TASK'),
  priority: priority.default('MEDIUM'),
  columnId: idSchema.optional(),
  assigneeId: idSchema.nullable().optional(),
  parentTaskId: idSchema.nullable().optional(),
  dueDate: isoDateSchema.nullable().optional(),
  startDate: isoDateSchema.nullable().optional(),
  storyPoints: z.number().int().min(0).max(999).nullable().optional(),
  labelIds: z.array(idSchema).max(20).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().max(20_000).optional(),
  type: taskType.optional(),
  priority: priority.optional(),
  assigneeId: idSchema.nullable().optional(),
  parentTaskId: idSchema.nullable().optional(),
  dueDate: isoDateSchema.nullable().optional(),
  startDate: isoDateSchema.nullable().optional(),
  storyPoints: z.number().int().min(0).max(999).nullable().optional(),
  labelIds: z.array(idSchema).max(20).optional(),
  /**
   * Optimistic concurrency — FR-F-14. Required.
   *
   * It used to be optional, and omitting it did not merely skip the check: the
   * server builds its patch from a snapshot read before the transaction and
   * back-fills every unspecified field from it, so a version-less
   * `PATCH { title }` silently reverted a concurrent writer's priority,
   * assignee and due date. A force-write is a deliberate act and now has to say
   * so, rather than being what you get by forgetting a field.
   */
  version: versionSchema,
});

export const moveTaskSchema = z.object({
  columnId: idSchema,
  /** Zero-based index within the destination column. */
  index: z.number().int().min(0),
  /** Required, for the same reason as on update. */
  version: versionSchema,
});

export const deleteTaskSchema = z.object({
  /** How to treat children — FR-F-07. Default keeps work by re-parenting. */
  strategy: z.enum(['REPARENT', 'CASCADE']).default('REPARENT'),
});

export const taskFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  assigneeId: z.union([idSchema, z.literal('me'), z.literal('unassigned')]).optional(),
  priority: priority.optional(),
  type: taskType.optional(),
  labelId: idSchema.optional(),
  dueWithinDays: z.coerce.number().int().min(0).max(365).optional(),
  includeArchived: z.coerce.boolean().default(false),
});

export const createLabelSchema = z.object({
  name: z.string().trim().min(1).max(32),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
export type TaskFilter = z.infer<typeof taskFilterSchema>;
