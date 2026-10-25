import type { Request, Response } from 'express';
import type { CreateProjectInput, ProjectRole, UpdateProjectInput } from '@taskforge/shared';
import { handler } from '../../core/async.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { projectService } from './project.service.js';

const projectIdOf = (req: Request): string => req.params['projectId'] as string;
const userIdOf = (req: Request): string => req.params['userId'] as string;

export const projectController = {
  list: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const includeArchived = req.query['includeArchived'] === 'true';
    res.json({ projects: projectService.list(auth, includeArchived) });
  }),

  create: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    res.status(201).json({ project: projectService.create(auth, req.body as CreateProjectInput) });
  }),

  get: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const project = projectService.get(auth, projectIdOf(req));
    res.json({ project, permissions: projectService.permissions(auth, project.id) });
  }),

  update: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    res.json({ project: projectService.update(auth, projectIdOf(req), req.body as UpdateProjectInput) });
  }),

  remove: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    projectService.remove(auth, projectIdOf(req));
    res.json({ ok: true });
  }),

  listMembers: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    res.json({ members: projectService.listMembers(auth, projectIdOf(req)) });
  }),

  addMember: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { userId, role } = req.body as { userId: string; role: ProjectRole };
    res.status(201).json({ member: projectService.addMember(auth, projectIdOf(req), userId, role) });
  }),

  updateMember: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { role } = req.body as { role: ProjectRole };
    res.json({ member: projectService.updateMemberRole(auth, projectIdOf(req), userIdOf(req), role) });
  }),

  removeMember: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    projectService.removeMember(auth, projectIdOf(req), userIdOf(req));
    res.json({ ok: true });
  }),
};
