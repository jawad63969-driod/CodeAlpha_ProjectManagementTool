import type { Request, Response } from 'express';
import { refreshSchema, type LoginInput, type RegisterInput, type UpdateProfileInput } from '@taskforge/shared';
import { handler } from '../core/async.js';
import { parseOrThrow } from '../middleware/validate.js';
import { requireAuth } from '../middleware/authenticate.js';
import { authService, type RequestMeta } from './auth.service.js';

const metaFrom = (req: Request): RequestMeta => ({
  userAgent: req.get('user-agent')?.slice(0, 200),
  ipAddress: req.ip,
});

export const authController = {
  register: handler(async (req: Request, res: Response) => {
    const session = await authService.register(req.body as RegisterInput, metaFrom(req));
    res.status(201).json(session);
  }),

  login: handler(async (req: Request, res: Response) => {
    const session = await authService.login(req.body as LoginInput, metaFrom(req));
    res.json(session);
  }),

  refresh: handler(async (req: Request, res: Response) => {
    const { refreshToken } = parseOrThrow(refreshSchema, req.body);
    res.json(authService.refresh(refreshToken, metaFrom(req)));
  }),

  logout: handler(async (req: Request, res: Response) => {
    const { refreshToken } = parseOrThrow(refreshSchema, req.body);
    authService.logout(refreshToken);
    res.json({ ok: true });
  }),

  workspaces: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    res.json({ workspaces: authService.listWorkspaces(auth.userId) });
  }),

  switchWorkspace: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { organizationId } = req.body as { organizationId: string };
    res.json(authService.switchWorkspace(auth.userId, organizationId, metaFrom(req)));
  }),

  me: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    res.json(authService.currentUser(auth.userId, auth.organizationId));
  }),

  updateProfile: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    res.json({ user: authService.updateProfile(auth.userId, req.body as UpdateProfileInput) });
  }),
};
