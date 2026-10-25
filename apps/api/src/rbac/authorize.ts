import { and, eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import { type Permission, type ProjectRole, hasPermission, resolvePermissions } from '@taskforge/shared';
import { db } from '../db/client.js';
import { attachments, boardColumns, boards, comments, projectMembers, projects, tasks } from '../db/schema.js';
import { AppError } from '../core/errors.js';
import type { AuthContext } from '../auth/context.js';

/**
 * The policy engine — ARCHITECTURE §6. This is the ONLY place in the codebase
 * that decides whether an action is permitted. Controllers declare what they
 * need; they never inspect a role themselves.
 */

/** Looks up the caller's role in a project, memoised for the life of the request. */
export const projectRoleFor = (auth: AuthContext, projectId: string): ProjectRole | null => {
  const cached = auth.projectRoleCache.get(projectId);
  if (cached !== undefined) return cached as ProjectRole | null;

  const row = db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, auth.userId)))
    .get();

  const role = (row?.role as ProjectRole | undefined) ?? null;
  auth.projectRoleCache.set(projectId, role);
  return role;
};

/**
 * Confirms the project exists **inside the caller's organisation**. A project in
 * another tenant is reported as missing rather than forbidden, so the API never
 * confirms that an id exists somewhere else (NFR-08).
 */
export const assertProjectInTenant = (auth: AuthContext, projectId: string): void => {
  const row = db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, auth.organizationId)))
    .get();
  if (!row) throw AppError.notFound('Project not found');
};

/** Service-layer check. Throws `403` when the permission is not granted. */
export const requirePermission = (
  auth: AuthContext,
  permission: Permission,
  projectId?: string | null,
): void => {
  const projectRole = projectId ? projectRoleFor(auth, projectId) : null;
  if (!hasPermission(auth.orgRole, projectRole, permission)) {
    throw AppError.forbidden(`You need the "${permission}" permission to do that`);
  }
};

/** Non-throwing variant, for shaping responses to what the caller may see. */
export const can = (auth: AuthContext, permission: Permission, projectId?: string | null): boolean =>
  hasPermission(auth.orgRole, projectId ? projectRoleFor(auth, projectId) : null, permission);

/** Everything the caller may do in a project — sent to the client to drive the UI. */
export const permissionsFor = (auth: AuthContext, projectId: string | null): Permission[] =>
  [...resolvePermissions(auth.orgRole, projectId ? projectRoleFor(auth, projectId) : null)];

/**
 * Route guard. `projectIdFrom` tells the engine where to find the project scope;
 * omit it for organisation-level permissions.
 *
 * Every mutating route in this codebase declares one of these — see
 * `tests/route-coverage.test.ts`, which fails the build if one does not.
 */
export interface AuthorizeMiddleware {
  (req: Request, res: Response, next: NextFunction): void;
  /** Read by tests/route-coverage.test.ts to prove no route is left unguarded. */
  __permission: Permission;
}

export const authorize = (
  permission: Permission,
  projectIdFrom?: (req: Request) => string | null | undefined,
): AuthorizeMiddleware => {
  const middleware = (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.auth) throw AppError.unauthenticated();
      const projectId = projectIdFrom?.(req) ?? null;
      if (projectId) assertProjectInTenant(req.auth, projectId);
      requirePermission(req.auth, permission, projectId);
      next();
    } catch (error) {
      next(error);
    }
  };
  (middleware as AuthorizeMiddleware).__permission = permission;
  return middleware as AuthorizeMiddleware;
};

/**
 * Resolvers that turn a child resource's id into its project, so a route keyed
 * on a globally unique id still evaluates project-scoped permissions. They
 * return null when the id is unknown; the service then produces the 404.
 */
export const fromColumn =
  (name = 'columnId') =>
  (req: Request): string | null => {
    const columnId = req.params[name];
    if (typeof columnId !== 'string') return null;
    const row = db
      .select({ projectId: boards.projectId })
      .from(boardColumns)
      .innerJoin(boards, eq(boards.id, boardColumns.boardId))
      .where(eq(boardColumns.id, columnId))
      .get();
    return row?.projectId ?? null;
  };

export const fromTask =
  (name = 'taskId') =>
  (req: Request): string | null => {
    const taskId = req.params[name];
    if (typeof taskId !== 'string') return null;
    const row = db.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, taskId)).get();
    return row?.projectId ?? null;
  };

export const fromAttachment =
  (name = 'attachmentId') =>
  (req: Request): string | null => {
    const attachmentId = req.params[name];
    if (typeof attachmentId !== 'string') return null;
    const row = db
      .select({ projectId: tasks.projectId })
      .from(attachments)
      .innerJoin(tasks, eq(tasks.id, attachments.taskId))
      .where(eq(attachments.id, attachmentId))
      .get();
    return row?.projectId ?? null;
  };

export const fromComment =
  (name = 'commentId') =>
  (req: Request): string | null => {
    const commentId = req.params[name];
    if (typeof commentId !== 'string') return null;
    const row = db
      .select({ projectId: tasks.projectId })
      .from(comments)
      .innerJoin(tasks, eq(tasks.id, comments.taskId))
      .where(eq(comments.id, commentId))
      .get();
    return row?.projectId ?? null;
  };

/** Common extractors, so routes stay declarative. */
export const fromParams =
  (name: string) =>
  (req: Request): string | null => {
    const value = req.params[name];
    return typeof value === 'string' ? value : null;
  };
