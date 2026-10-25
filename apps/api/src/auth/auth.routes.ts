import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { idSchema, loginSchema, registerSchema, updateProfileSchema } from '@taskforge/shared';
import { ErrorCode } from '@taskforge/shared';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { env } from '../config/env.js';
import { authController } from './auth.controller.js';

/** Brute-force guard on the credential endpoints (FR-A-08). Disabled in tests. */
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 10_000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: {
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many attempts. Please wait a few minutes and try again.',
      requestId: 'rate-limited',
    },
  },
});

export const authRouter = Router();

authRouter.post('/auth/register', credentialLimiter, validate(registerSchema), authController.register);
authRouter.post('/auth/login', credentialLimiter, validate(loginSchema), authController.login);
authRouter.post('/auth/refresh', authController.refresh);
authRouter.post('/auth/logout', authController.logout);
authRouter.get('/auth/workspaces', authenticate, authController.workspaces);
authRouter.post(
  '/auth/workspaces/switch',
  authenticate,
  validate(z.object({ organizationId: idSchema })),
  authController.switchWorkspace,
);
authRouter.get('/auth/me', authenticate, authController.me);
authRouter.patch('/auth/me', authenticate, validate(updateProfileSchema), authController.updateProfile);
