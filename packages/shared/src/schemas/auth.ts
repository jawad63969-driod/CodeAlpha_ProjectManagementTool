import { z } from 'zod';
import { emailSchema, hexColorSchema } from './common.js';

/** NFR: 10+ characters with at least one letter and one digit (FR-A-01). */
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200, 'Password is too long')
  .refine((v) => /[A-Za-z]/.test(v), 'Password must contain a letter')
  .refine((v) => /\d/.test(v), 'Password must contain a digit');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: emailSchema,
  password: passwordSchema,
  organizationName: z.string().trim().min(2).max(80).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  jobTitle: z.string().trim().max(80).nullable().optional(),
  avatarColor: hexColorSchema.optional(),
  timezone: z.string().trim().max(64).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
