import { and, eq, sql } from 'drizzle-orm';
import {
  DEFAULT_WORKFLOW,
  EntityType,
  OrgRole,
  Permission,
  ProjectRole,
  type BoardDto,
  type CreateProjectInput,
  type LabelDto,
  type ProjectDto,
  type ProjectMemberDto,
  type UpdateProjectInput,
  type WorkflowStatusDto,
} from '@taskforge/shared';
import { db } from '../../db/client.js';
import { projects, tasks } from '../../db/schema.js';
import { AppError } from '../../core/errors.js';
import { ID_PREFIX, newId } from '../../core/ids.js';
import { nowIso } from '../../core/result.js';
import { STEP } from '../../core/lexorank.js';
import { can, requirePermission } from '../../rbac/authorize.js';
import { authRepository } from '../../auth/auth.repository.js';
import { diff, recordActivity } from '../activity/activity.recorder.js';
import { publish } from '../../realtime/publisher.js';
import { projectRepository as repo } from './project.repository.js';
import type { AuthContext } from '../../auth/context.js';

type ProjectRow = typeof projects.$inferSelect;

export const toProjectDto = (
  row: ProjectRow,
  extras: Partial<Pick<ProjectDto, 'memberCount' | 'taskCount' | 'doneCount' | 'role'>> = {},
): ProjectDto => ({
  id: row.id,
  organizationId: row.organizationId,
  key: row.key,
  name: row.name,
  description: row.description,
  color: row.color,
  leadId: row.leadId,
  archived: row.archivedAt !== null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  ...extras,
});

export const toBoardDto = (row: { id: string; projectId: string; name: string; isDefault: boolean }): BoardDto => ({
  id: row.id,
  projectId: row.projectId,
  name: row.name,
  isDefault: row.isDefault,
});

export const toStatusDto = (row: {
  id: string; name: string; category: string; position: number; isInitial: boolean;
}): WorkflowStatusDto => ({
  id: row.id,
  name: row.name,
  category: row.category as WorkflowStatusDto['category'],
  position: row.position,
  isInitial: row.isInitial,
});

export const toLabelDto = (row: { id: string; name: string; color: string }): LabelDto => ({
  id: row.id,
  name: row.name,
  color: row.color,
});

const toMemberDto = (row: {
  member: { role: string; joinedAt: string };
  user: { id: string; name: string; email: string; jobTitle: string | null; avatarColor: string };
}): ProjectMemberDto => ({
  id: row.user.id,
  name: row.user.name,
  email: row.user.email,
  jobTitle: row.user.jobTitle,
  avatarColor: row.user.avatarColor,
  role: row.member.role as ProjectRole,
  joinedAt: row.member.joinedAt,
});

/** Derives a board key from the project name, then makes it unique in the org. */
const deriveKey = (name: string, organizationId: string): string => {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, '');
  const base = (letters.slice(0, 4) || 'PROJ').padEnd(2, 'X');
  if (!repo.findByKey(base, organizationId)) return base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base.slice(0, 8)}${suffix}`;
    if (!repo.findByKey(candidate, organizationId)) return candidate;
  }
  throw AppError.conflict('Could not derive a unique project key — please supply one');
};

export const projectService = {
  /**
   * Creating a project provisions its whole board in one transaction (FR-D-02):
   * a default board, the four workflow statuses and a column per status. A
   * project is never handed to a user in a half-configured state.
   */
  create(auth: AuthContext, input: CreateProjectInput): ProjectDto {
    requirePermission(auth, Permission.PROJECT_CREATE);

    const key = input.key ?? deriveKey(input.name, auth.organizationId);
    if (repo.findByKey(key, auth.organizationId)) {
      throw AppError.conflict(`A project with the key "${key}" already exists`);
    }
    if (input.leadId && !authRepository.findMembership(auth.organizationId, input.leadId)) {
      throw AppError.validation('The project lead must be a member of this workspace');
    }

    const projectId = newId(ID_PREFIX.project);

    return db.transaction((tx) => {
      repo.insert(
        {
          id: projectId,
          organizationId: auth.organizationId,
          key,
          name: input.name,
          description: input.description,
          color: input.color,
          leadId: input.leadId ?? auth.userId,
          createdBy: auth.userId,
        },
        tx,
      );

      repo.insertMember(
        {
          id: newId(ID_PREFIX.projectMember),
          projectId,
          userId: auth.userId,
          role: ProjectRole.PROJECT_MANAGER,
          addedBy: auth.userId,
        },
        tx,
      );

      const boardId = newId(ID_PREFIX.board);
      repo.insertBoard({ id: boardId, projectId, name: `${input.name} Board`, isDefault: true }, tx);

      DEFAULT_WORKFLOW.forEach((status, index) => {
        const statusId = newId(ID_PREFIX.status);
        repo.insertStatus(
          {
            id: statusId,
            projectId,
            name: status.name,
            category: status.category,
            position: (index + 1) * STEP,
            isInitial: status.isInitial,
          },
          tx,
        );
        repo.insertColumn(
          {
            id: newId(ID_PREFIX.column),
            boardId,
            statusId,
            name: status.name,
            position: (index + 1) * STEP,
          },
          tx,
        );
      });

      recordActivity(tx, {
        organizationId: auth.organizationId,
        projectId,
        actorId: auth.userId,
        entityType: EntityType.PROJECT,
        entityId: projectId,
        action: 'created',
        changes: { name: { from: null, to: input.name } },
      });

      const created = tx.select().from(projects).where(eq(projects.id, projectId)).get()!;
      return toProjectDto(created, {
        role: ProjectRole.PROJECT_MANAGER,
        memberCount: 1,
        taskCount: 0,
        doneCount: 0,
      });
    });
  },

  list(auth: AuthContext, includeArchived = false): ProjectDto[] {
    // Org owners and admins hold project.read globally, so they see everything.
    const seesEverything = auth.orgRole === OrgRole.OWNER || auth.orgRole === OrgRole.ADMIN;
    return repo
      .listVisible(auth.organizationId, auth.userId, { seesEverything, includeArchived })
      .map((row) =>
        toProjectDto(row.project, {
          role: (row.role as ProjectRole | null) ?? null,
          memberCount: Number(row.memberCount),
          taskCount: Number(row.taskCount),
          doneCount: Number(row.doneCount),
        }),
      );
  },

  /** Loads a project the caller is allowed to read, or throws. */
  load(auth: AuthContext, projectId: string): ProjectRow {
    const project = repo.findById(projectId, auth.organizationId);
    // Outside the tenant is indistinguishable from non-existent (NFR-08).
    if (!project) throw AppError.notFound('Project not found');
    requirePermission(auth, Permission.PROJECT_READ, projectId);
    return project;
  },

  get(auth: AuthContext, projectId: string): ProjectDto {
    const project = this.load(auth, projectId);
    const counts = repo.counts(projectId);
    const member = repo.findMember(projectId, auth.userId);
    return toProjectDto(project, {
      role: (member?.role as ProjectRole | undefined) ?? null,
      memberCount: Number(counts?.memberCount ?? 0),
      taskCount: Number(counts?.taskCount ?? 0),
      doneCount: Number(counts?.doneCount ?? 0),
    });
  },

  update(auth: AuthContext, projectId: string, input: UpdateProjectInput): ProjectDto {
    const project = this.load(auth, projectId);
    requirePermission(auth, Permission.PROJECT_UPDATE, projectId);

    if (input.leadId && !authRepository.findMembership(auth.organizationId, input.leadId)) {
      throw AppError.validation('The project lead must be a member of this workspace');
    }
    if (input.archived !== undefined) requirePermission(auth, Permission.PROJECT_ARCHIVE, projectId);

    const patch = {
      name: input.name ?? project.name,
      description: input.description ?? project.description,
      color: input.color ?? project.color,
      leadId: input.leadId === undefined ? project.leadId : input.leadId,
      archivedAt:
        input.archived === undefined
          ? project.archivedAt
          : input.archived
            ? (project.archivedAt ?? nowIso())
            : null,
      updatedAt: nowIso(),
    };

    const updated = db.transaction((tx) => {
      repo.update(projectId, patch, tx);
      const changes = diff(project as unknown as Record<string, unknown>, patch);
      if (Object.keys(changes).length > 0) {
        recordActivity(tx, {
          organizationId: auth.organizationId,
          projectId,
          actorId: auth.userId,
          entityType: EntityType.PROJECT,
          entityId: projectId,
          action: input.archived === true ? 'archived' : 'updated',
          changes,
        });
      }
      const row = tx.select().from(projects).where(eq(projects.id, projectId)).get()!;
      return toProjectDto(row, { role: (repo.findMember(projectId, auth.userId)?.role as ProjectRole) ?? null });
    });

    publish.toProject(
      { actorId: auth.userId, organizationId: auth.organizationId, projectId },
      'project.updated',
      { project: updated },
    );
    return updated;
  },

  /** Hard delete. Every child row goes with it through ON DELETE CASCADE. */
  remove(auth: AuthContext, projectId: string): void {
    this.load(auth, projectId);
    requirePermission(auth, Permission.PROJECT_DELETE, projectId);
    repo.remove(projectId);
    publish.toProject(
      { actorId: auth.userId, organizationId: auth.organizationId, projectId },
      'project.deleted',
      { projectId },
    );
  },

  /* ---------------------------------------------------------------- members */

  listMembers(auth: AuthContext, projectId: string): ProjectMemberDto[] {
    this.load(auth, projectId);
    const rank = { PROJECT_MANAGER: 0, DEVELOPER: 1, VIEWER: 2 } as const;
    return repo
      .listMembers(projectId)
      .map(toMemberDto)
      .sort((a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name));
  },

  addMember(auth: AuthContext, projectId: string, userId: string, role: ProjectRole): ProjectMemberDto {
    this.load(auth, projectId);
    requirePermission(auth, Permission.PROJECT_MEMBER_MANAGE, projectId);

    // A project member must already belong to the workspace — this is the line
    // that stops project membership becoming a back door into the tenant.
    if (!authRepository.findMembership(auth.organizationId, userId)) {
      throw AppError.notFound('That person is not a member of this workspace');
    }
    if (repo.findMember(projectId, userId)) {
      throw AppError.conflict('That person is already on this project');
    }

    db.transaction((tx) => {
      repo.insertMember(
        { id: newId(ID_PREFIX.projectMember), projectId, userId, role, addedBy: auth.userId },
        tx,
      );
      recordActivity(tx, {
        organizationId: auth.organizationId,
        projectId,
        actorId: auth.userId,
        entityType: EntityType.MEMBER,
        entityId: userId,
        action: 'added',
        changes: { role: { from: null, to: role } },
      });
    });

    const member = toMemberDto(repo.listMembers(projectId).find((row) => row.user.id === userId)!);
    publish.toProject(
      { actorId: auth.userId, organizationId: auth.organizationId, projectId },
      'member.added',
      { member },
    );
    return member;
  },

  updateMemberRole(auth: AuthContext, projectId: string, userId: string, role: ProjectRole): ProjectMemberDto {
    this.load(auth, projectId);
    requirePermission(auth, Permission.PROJECT_MEMBER_MANAGE, projectId);

    const existing = repo.findMember(projectId, userId);
    if (!existing) throw AppError.notFound('That person is not on this project');

    // A project must keep someone who can administer it.
    if (existing.role === ProjectRole.PROJECT_MANAGER && role !== ProjectRole.PROJECT_MANAGER) {
      const managers = repo.listMembers(projectId).filter((r) => r.member.role === ProjectRole.PROJECT_MANAGER);
      if (managers.length <= 1) throw AppError.conflict('A project must keep at least one project manager');
    }

    db.transaction((tx) => {
      repo.updateMember(projectId, userId, role, tx);
      recordActivity(tx, {
        organizationId: auth.organizationId,
        projectId,
        actorId: auth.userId,
        entityType: EntityType.MEMBER,
        entityId: userId,
        action: 'role_changed',
        changes: { role: { from: existing.role, to: role } },
      });
    });

    publish.toProject(
      { actorId: auth.userId, organizationId: auth.organizationId, projectId },
      'member.updated',
      { userId, role },
    );
    return toMemberDto(repo.listMembers(projectId).find((row) => row.user.id === userId)!);
  },

  removeMember(auth: AuthContext, projectId: string, userId: string): void {
    this.load(auth, projectId);
    requirePermission(auth, Permission.PROJECT_MEMBER_MANAGE, projectId);

    const existing = repo.findMember(projectId, userId);
    if (!existing) throw AppError.notFound('That person is not on this project');
    if (existing.role === ProjectRole.PROJECT_MANAGER) {
      const managers = repo.listMembers(projectId).filter((r) => r.member.role === ProjectRole.PROJECT_MANAGER);
      if (managers.length <= 1) throw AppError.conflict('A project must keep at least one project manager');
    }

    db.transaction((tx) => {
      repo.removeMember(projectId, userId, tx);
      // Their open work does not vanish — it goes back to the pool (FR-D-03).
      //
      // Scoped to THIS project. Without the projectId predicate this unassigned
      // every task the user held anywhere, including in other organisations —
      // a cross-tenant write reachable by the lowest role holding
      // PROJECT_MEMBER_MANAGE. Covered by tenant-isolation.test.ts.
      tx.update(tasks)
        .set({ assigneeId: null, version: sql`${tasks.version} + 1` })
        .where(and(eq(tasks.assigneeId, userId), eq(tasks.projectId, projectId)))
        .run();
      recordActivity(tx, {
        organizationId: auth.organizationId,
        projectId,
        actorId: auth.userId,
        entityType: EntityType.MEMBER,
        entityId: userId,
        action: 'removed',
      });
    });

    publish.toProject(
      { actorId: auth.userId, organizationId: auth.organizationId, projectId },
      'member.removed',
      { userId },
    );
  },

  /** What the caller may do here — used by the client to hide what it cannot use. */
  permissions(auth: AuthContext, projectId: string): string[] {
    return Object.values(Permission).filter((permission) => can(auth, permission, projectId));
  },
};
