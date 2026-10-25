import type { Request, Response } from 'express';
import type { AddOrgMemberInput, OrgRole } from '@taskforge/shared';
import { handler } from '../../core/async.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { permissionsFor } from '../../rbac/authorize.js';
import { authService } from '../../auth/auth.service.js';
import { organizationService } from './organization.service.js';

export const organizationController = {
  current: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { organization, orgRole } = authService.currentUser(auth.userId, auth.organizationId);
    res.json({ organization, orgRole, permissions: permissionsFor(auth, null) });
  }),

  rename: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    res.json({ organization: organizationService.rename(auth, (req.body as { name: string }).name) });
  }),

  listMembers: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    res.json({ members: organizationService.listMembers(auth) });
  }),

  addMember: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    res.status(201).json({ member: organizationService.addMember(auth, req.body as AddOrgMemberInput) });
  }),

  updateRole: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const userId = req.params['userId'] as string;
    const { role } = req.body as { role: OrgRole };
    res.json({ member: organizationService.updateRole(auth, userId, role) });
  }),

  setStatus: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const userId = req.params['userId'] as string;
    const { status } = req.body as { status: 'ACTIVE' | 'SUSPENDED' };
    res.json({ member: organizationService.setStatus(auth, userId, status) });
  }),

  removeMember: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    organizationService.removeMember(auth, req.params['userId'] as string);
    res.json({ ok: true });
  }),
};
