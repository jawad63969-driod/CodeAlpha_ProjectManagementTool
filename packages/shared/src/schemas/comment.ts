import { z } from 'zod';
import { idSchema } from './common.js';

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(5000),
  parentCommentId: idSchema.nullable().optional(),
});

export const updateCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
