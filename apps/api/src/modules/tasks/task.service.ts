import { eq, like, sql } from 'drizzle-orm';
import {
  EntityType,
  MAX_TASK_DEPTH,
  Permission,
  StatusCategory,
  type CreateTaskInput,
  type LabelDto,
  type MoveTaskInput,
  type TaskDto,
  type TaskPriority,
  type TaskType,
  type UpdateTaskInput,
} from '@taskforge/shared';
import { db, type Executor } from '../../db/client.js';
import { tasks } from '../../db/schema.js';
import { AppError } from '../../core/errors.js';
import { ID_PREFIX, newId } from '../../core/ids.js';
import { nowIso, toPage } from '../../core/result.js';
import { compact, needsCompaction, positionAfter, positionAt } from '../../core/lexorank.js';
import { requirePermission } from '../../rbac/authorize.js';
import { authRepository } from '../../auth/auth.repository.js';
import { diff, recordActivity } from '../activity/activity.recorder.js';
import { projectRepository } from '../projects/project.repository.js';
import { projectService } from '../projects/project.service.js';
import { boardService } from '../boards/board.service.js';
import { notificationService, type NotificationSeed } from '../notifications/notification.service.js';
import { publish, type EventOrigin } from '../../realtime/publisher.js';
import { NotificationType } from '@taskforge/shared';
import { encodeWorkCursor, taskRepository as repo, type TaskWithCounts } from './task.repository.js';
import type { AuthContext } from '../../auth/context.js';

type TaskRow = typeof tasks.$inferSelect;

/* ─────────────────────────────── hierarchy helpers ────────────────────────── */

/** A child's path is its parent's path plus the parent's id. Root tasks are `/`. */
const childPathOf = (parent: Pick<TaskRow, 'path' | 'id'>): string => `${parent.path}${parent.id}/`;

/** The prefix every descendant of `task` shares. */
const subtreePrefix = (task: Pick<TaskRow, 'path' | 'id'>): string => `${task.path}${task.id}/`;

/**
 * A task may not become its own ancestor (FR-F-06). With a materialised path
 * this is a string test rather than a walk to the root.
 */
const assertNoCycle = (task: Pick<TaskRow, 'id' | 'path'>, candidateParent: Pick<TaskRow, 'id' | 'path'>): void => {
  if (candidateParent.id === task.id) {
    throw AppError.unprocessable('A task cannot be its own parent');
  }
  if (candidateParent.path.startsWith(subtreePrefix(task))) {
    throw AppError.unprocessable('That would place the task inside its own subtree');
  }
};

export const toTaskDto = (
  row: TaskWithCounts,
  projectKey: string,
  labels: LabelDto[] = [],
): TaskDto => ({
  id: row.task.id,
  organizationId: row.task.organizationId,
  projectId: row.task.projectId,
  boardId: row.task.boardId,
  columnId: row.task.columnId,
  statusId: row.task.statusId,
  number: row.task.number,
  ref: `${projectKey}-${row.task.number}`,
  type: row.task.type as TaskType,
  title: row.task.title,
  description: row.task.description,
  priority: row.task.priority as TaskPriority,
  assigneeId: row.task.assigneeId,
  reporterId: row.task.reporterId,
  parentTaskId: row.task.parentTaskId,
  depth: row.task.depth,
  position: row.task.position,
  storyPoints: row.task.storyPoints,
  startDate: row.task.startDate,
  dueDate: row.task.dueDate,
  resolvedAt: row.task.resolvedAt,
  archived: row.task.archivedAt !== null,
  version: row.task.version,
  createdAt: row.task.createdAt,
  updatedAt: row.task.updatedAt,
  labels,
  commentCount: Number(row.commentCount),
  attachmentCount: Number(row.attachmentCount),
  subtaskCount: Number(row.subtaskCount),
  subtaskDoneCount: Number(row.subtaskDoneCount),
});

/** Batches the label lookup for a page of tasks — one query, never N. */
export const attachLabels = (rows: TaskWithCounts[], projectKey: string, tx: Executor = db): TaskDto[] => {
  const byTask = new Map<string, LabelDto[]>();
  for (const { taskId, label } of repo.labelsForTasks(rows.map((r) => r.task.id), tx)) {
    const list = byTask.get(taskId) ?? [];
    list.push({ id: label.id, name: label.name, color: label.color });
    byTask.set(taskId, list);
  }
  return rows.map((row) => toTaskDto(row, projectKey, byTask.get(row.task.id) ?? []));
};

/** Must stay in step with PRIORITY_RANK in task.repository.ts. */
const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, LOWEST: 4 };

export const taskService = {
  /* ──────────────────────────────── reading ───────────────────────────────── */

  load(auth: AuthContext, taskId: string): TaskRow {
    const task = repo.findById(taskId, auth.organizationId);
    if (!task) throw AppError.notFound('Task not found');
    projectService.load(auth, task.projectId); // re-checks project read permission
    return task;
  },

  get(auth: AuthContext, taskId: string): TaskDto {
    const task = this.load(auth, taskId);
    const project = projectRepository.findById(task.projectId, auth.organizationId)!;
    const row = repo.findWithCounts(taskId, auth.organizationId)!;
    return attachLabels([row], project.key)[0]!;
  },

  /** Direct children of a task, for the subtask tree in the detail panel. */
  subtasks(auth: AuthContext, taskId: string): TaskDto[] {
    const task = this.load(auth, taskId);
    const project = projectRepository.findById(task.projectId, auth.organizationId)!;
    const rows = repo
      .children(taskId)
      .map((child) => repo.findWithCounts(child.id, auth.organizationId)!)
      .filter(Boolean);
    return attachLabels(rows, project.key);
  },

  /**
   * Cross-project "My Work" (FR-F-12), cursor paginated.
   *
   * The cursor is built from the same three values the query sorts on, not from
   * the row id — see the note on `listAssigned`. `toPage` is not used here
   * because it assumes the sort key IS the id.
   */
  listAssignedToMe(auth: AuthContext, limit: number, cursor: string | null) {
    const rows = repo.listAssigned(auth.userId, auth.organizationId, limit, cursor);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const keys = new Map<string, string>();
    const dtos = page.map((row) => {
      let key = keys.get(row.task.projectId);
      if (!key) {
        key = projectRepository.findById(row.task.projectId, auth.organizationId)?.key ?? '??';
        keys.set(row.task.projectId, key);
      }
      return toTaskDto(row, key);
    });

    const last = page.at(-1);
    const nextCursor =
      hasMore && last
        ? encodeWorkCursor(PRIORITY_ORDER[last.task.priority] ?? 4, last.task.dueDate ?? '9999-12-31', last.task.id)
        : null;

    return { data: dtos, nextCursor };
  },

  /* ──────────────────────────────── writing ───────────────────────────────── */

  create(auth: AuthContext, projectId: string, input: CreateTaskInput): TaskDto {
    const project = projectService.load(auth, projectId);
    requirePermission(auth, Permission.TASK_CREATE, projectId);

    const board = boardService.resolveBoard(projectId);
    const columns = projectRepository.listColumns(board.id);
    if (columns.length === 0) throw AppError.conflict('This board has no columns yet');

    const column = input.columnId
      ? columns.find((c) => c.column.id === input.columnId)
      : (columns.find((c) => c.status.isInitial) ?? columns[0]);
    if (!column) throw AppError.validation('That column does not belong to this project');

    if (input.assigneeId && !projectRepository.findMember(projectId, input.assigneeId)) {
      throw AppError.validation('Tasks can only be assigned to members of this project');
    }

    let parent: TaskRow | null = null;
    if (input.parentTaskId) {
      parent = repo.findById(input.parentTaskId, auth.organizationId) ?? null;
      if (!parent || parent.projectId !== projectId) {
        throw AppError.validation('The parent task is not in this project');
      }
      if (parent.depth + 1 > MAX_TASK_DEPTH) {
        throw AppError.unprocessable(`Subtasks cannot nest more than ${MAX_TASK_DEPTH + 1} levels deep`);
      }
    }

    const labelIds = input.labelIds ?? [];
    if (labelIds.length > 0) {
      const found = projectRepository.findLabelsByIds(labelIds, projectId);
      if (found.length !== labelIds.length) throw AppError.validation('One or more labels do not belong to this project');
    }

    const taskId = newId(ID_PREFIX.task);
    const origin: EventOrigin = { actorId: auth.userId, organizationId: auth.organizationId, projectId };

    const created = db.transaction((tx) => {
      const number = projectRepository.nextTaskNumber(projectId, tx);
      const siblings = repo.positionsInColumn(column.column.id, null, tx);

      repo.insert(
        {
          id: taskId,
          organizationId: auth.organizationId,
          projectId,
          boardId: board.id,
          columnId: column.column.id,
          statusId: column.column.statusId,
          number,
          type: input.parentTaskId ? (input.type === 'TASK' ? 'SUBTASK' : input.type) : input.type,
          title: input.title,
          description: input.description,
          priority: input.priority,
          assigneeId: input.assigneeId ?? null,
          reporterId: auth.userId,
          parentTaskId: parent?.id ?? null,
          path: parent ? childPathOf(parent) : '/',
          depth: parent ? parent.depth + 1 : 0,
          position: positionAfter(siblings.at(-1)?.position ?? null),
          storyPoints: input.storyPoints ?? null,
          startDate: input.startDate ?? null,
          dueDate: input.dueDate ?? null,
          resolvedAt: column.status.category === StatusCategory.DONE ? nowIso() : null,
        },
        tx,
      );

      if (labelIds.length > 0) repo.setLabels(taskId, labelIds, tx);

      // The reporter and the assignee care about this task by definition.
      repo.addWatcher(taskId, auth.userId, tx);
      if (input.assigneeId) repo.addWatcher(taskId, input.assigneeId, tx);

      recordActivity(tx, {
        organizationId: auth.organizationId,
        projectId,
        actorId: auth.userId,
        entityType: EntityType.TASK,
        entityId: taskId,
        action: 'created',
        changes: { title: { from: null, to: input.title } },
      });

      const seeds: NotificationSeed[] = input.assigneeId
        ? [{
            userId: input.assigneeId,
            type: NotificationType.TASK_ASSIGNED,
            message: `assigned you ${input.title}`,
            taskId,
          }]
        : [];

      const row = repo.findWithCounts(taskId, auth.organizationId, tx)!;
      return {
        dto: attachLabels([row], project.key, tx)[0]!,
        notificationIds: notificationService.create(tx, origin, seeds),
      };
    });

    publish.toProject({ ...origin, projectId }, 'task.created', { task: created.dto });
    notificationService.deliver(origin, created.notificationIds);
    return created.dto;
  },

  update(auth: AuthContext, taskId: string, input: UpdateTaskInput): TaskDto {
    const task = this.load(auth, taskId);
    requirePermission(auth, Permission.TASK_UPDATE, task.projectId);
    const project = projectRepository.findById(task.projectId, auth.organizationId)!;

    if (input.assigneeId && !projectRepository.findMember(task.projectId, input.assigneeId)) {
      throw AppError.validation('Tasks can only be assigned to members of this project');
    }
    if (input.labelIds) {
      const found = projectRepository.findLabelsByIds(input.labelIds, task.projectId);
      if (found.length !== input.labelIds.length) {
        throw AppError.validation('One or more labels do not belong to this project');
      }
    }

    // Re-parenting is validated before anything is written.
    let newParent: TaskRow | null | undefined;
    if (input.parentTaskId !== undefined) {
      if (input.parentTaskId === null) {
        newParent = null;
      } else {
        newParent = repo.findById(input.parentTaskId, auth.organizationId) ?? null;
        if (!newParent || newParent.projectId !== task.projectId) {
          throw AppError.validation('The parent task is not in this project');
        }
        assertNoCycle(task, newParent);

        const newDepth = newParent.depth + 1;
        const deepest = Math.max(task.depth, repo.maxDescendantDepth(task));
        if (deepest - task.depth + newDepth > MAX_TASK_DEPTH) {
          throw AppError.unprocessable(
            `Moving this task would nest its subtasks more than ${MAX_TASK_DEPTH + 1} levels deep`,
          );
        }
      }
    }

    const patch: Partial<TaskRow> = {
      title: input.title ?? task.title,
      description: input.description === undefined ? task.description : input.description,
      type: input.type ?? task.type,
      priority: input.priority ?? task.priority,
      assigneeId: input.assigneeId === undefined ? task.assigneeId : input.assigneeId,
      storyPoints: input.storyPoints === undefined ? task.storyPoints : input.storyPoints,
      startDate: input.startDate === undefined ? task.startDate : input.startDate,
      dueDate: input.dueDate === undefined ? task.dueDate : input.dueDate,
      updatedAt: nowIso(),
    };

    if (newParent !== undefined) {
      patch.parentTaskId = newParent?.id ?? null;
      patch.path = newParent ? childPathOf(newParent) : '/';
      patch.depth = newParent ? newParent.depth + 1 : 0;
    }

    const origin: EventOrigin = {
      actorId: auth.userId,
      organizationId: auth.organizationId,
      projectId: task.projectId,
    };

    const updated = db.transaction((tx) => {
      // Compare-and-set is the only write path. `version` is required by the
      // schema, so there is no branch that writes without checking it.
      const changed = repo.updateIfVersion(taskId, input.version, patch, tx);
      if (changed === 0) {
        const current = repo.findWithCounts(taskId, auth.organizationId, tx)!;
        throw AppError.versionConflict(
          'Someone else changed this task while you were editing it',
          attachLabels([current], project.key, tx)[0],
        );
      }

      // Re-parenting rewrites the subtree's paths and depths in one statement.
      if (newParent !== undefined) {
        const oldPrefix = subtreePrefix(task);
        const newPrefix = `${patch.path}${task.id}/`;
        const shift = (patch.depth ?? 0) - task.depth;
        if (oldPrefix !== newPrefix) {
          tx.update(tasks)
            .set({
              path: sql`${newPrefix} || substr(${tasks.path}, ${oldPrefix.length + 1})`,
              depth: sql`${tasks.depth} + ${shift}`,
            })
            .where(like(tasks.path, `${oldPrefix}%`))
            .run();
        }
      }

      if (input.labelIds) repo.setLabels(taskId, input.labelIds, tx);
      if (input.assigneeId) repo.addWatcher(taskId, input.assigneeId, tx);

      const changes = diff(task as unknown as Record<string, unknown>, patch as Record<string, unknown>);
      delete changes['updatedAt'];
      if (Object.keys(changes).length > 0) {
        recordActivity(tx, {
          organizationId: auth.organizationId,
          projectId: task.projectId,
          actorId: auth.userId,
          entityType: EntityType.TASK,
          entityId: taskId,
          action: changes['assigneeId'] ? 'assigned' : 'updated',
          changes,
        });
      }

      const reassigned = input.assigneeId !== undefined && input.assigneeId !== task.assigneeId;
      const seeds: NotificationSeed[] = reassigned && input.assigneeId
        ? [{
            userId: input.assigneeId,
            type: NotificationType.TASK_ASSIGNED,
            message: `assigned you ${patch.title ?? task.title}`,
            taskId,
          }]
        : [];

      const row = repo.findWithCounts(taskId, auth.organizationId, tx)!;
      return {
        dto: attachLabels([row], project.key, tx)[0]!,
        notificationIds: notificationService.create(tx, origin, seeds),
      };
    });

    publish.toProject({ ...origin, projectId: task.projectId }, 'task.updated', { task: updated.dto });
    notificationService.deliver(origin, updated.notificationIds);
    return updated.dto;
  },

  /**
   * Moving is its own operation rather than a field update: it changes column,
   * status, order and resolution together, and it is the one write that happens
   * on every drag (FR-F-09).
   */
  move(auth: AuthContext, taskId: string, input: MoveTaskInput): { task: TaskDto; fromColumnId: string } {
    const task = this.load(auth, taskId);
    requirePermission(auth, Permission.TASK_MOVE, task.projectId);
    const project = projectRepository.findById(task.projectId, auth.organizationId)!;

    const column = projectRepository.findColumn(input.columnId);
    if (!column || column.board.projectId !== task.projectId) {
      throw AppError.validation('That column does not belong to this project');
    }

    const origin: EventOrigin = {
      actorId: auth.userId,
      organizationId: auth.organizationId,
      projectId: task.projectId,
    };

    const moved = db.transaction((tx) => {
      const siblings = repo.positionsInColumn(column.column.id, taskId, tx);
      let position = positionAt(siblings.map((s) => s.position), input.index);

      const patch: Partial<TaskRow> = {
        columnId: column.column.id,
        statusId: column.column.statusId,
        boardId: column.board.id,
        position,
        resolvedAt:
          column.status.category === StatusCategory.DONE ? (task.resolvedAt ?? nowIso()) : null,
        updatedAt: nowIso(),
      };

      // As on update: compare-and-set is the only path, `version` is required.
      const changed = repo.updateIfVersion(taskId, input.version, patch, tx);
      if (changed === 0) {
        const current = repo.findWithCounts(taskId, auth.organizationId, tx)!;
        throw AppError.versionConflict(
          'Someone else moved this card while you were dragging it',
          attachLabels([current], project.key, tx)[0],
        );
      }

      // Fractional positions eventually run out of room; compact when they do.
      const after = repo.positionsInColumn(column.column.id, null, tx);
      if (needsCompaction(after.map((s) => s.position))) {
        const fresh = compact(after.length);
        after.forEach((sibling, index) => {
          repo.update(sibling.id, { position: fresh[index]! }, tx);
        });
        position = fresh[after.findIndex((s) => s.id === taskId)] ?? position;
      }

      const changedColumn = task.columnId !== column.column.id;
      const seeds: NotificationSeed[] = changedColumn
        ? notificationService.watcherIds(tx, taskId, auth.userId).map((userId) => ({
            userId,
            type: NotificationType.TASK_MOVED,
            message: `moved ${task.title} to ${column.column.name}`,
            taskId,
          }))
        : [];

      if (changedColumn) {
        recordActivity(tx, {
          organizationId: auth.organizationId,
          projectId: task.projectId,
          actorId: auth.userId,
          entityType: EntityType.TASK,
          entityId: taskId,
          action: 'moved',
          changes: { columnId: { from: task.columnId, to: column.column.id } },
        });
      }

      const row = repo.findWithCounts(taskId, auth.organizationId, tx)!;
      return {
        task: attachLabels([row], project.key, tx)[0]!,
        fromColumnId: task.columnId,
        notificationIds: notificationService.create(tx, origin, seeds),
      };
    });

    publish.toProject({ ...origin, projectId: task.projectId }, 'task.moved', {
      task: moved.task,
      fromColumnId: moved.fromColumnId,
      toColumnId: column.column.id,
    });
    notificationService.deliver(origin, moved.notificationIds);
    return { task: moved.task, fromColumnId: moved.fromColumnId };
  },

  /**
   * Deleting a parent needs an explicit decision about its children (FR-F-07).
   * The default lifts them to the grandparent, because silently destroying work
   * is the worse failure.
   */
  remove(auth: AuthContext, taskId: string, strategy: 'REPARENT' | 'CASCADE'): { reparentedTo: string | null } {
    const task = this.load(auth, taskId);
    const isOwnWork = task.reporterId === auth.userId || task.assigneeId === auth.userId;
    if (!isOwnWork) {
      requirePermission(auth, Permission.TASK_DELETE_ANY, task.projectId);
    } else {
      requirePermission(auth, Permission.TASK_DELETE, task.projectId);
    }

    const result = db.transaction((tx) => {
      const children = repo.children(taskId, tx);
      let reparentedTo: string | null = null;

      if (children.length > 0 && strategy === 'REPARENT') {
        const grandparent = task.parentTaskId
          ? repo.findById(task.parentTaskId, auth.organizationId, tx)
          : null;
        reparentedTo = grandparent?.id ?? null;

        const newChildPath = grandparent ? childPathOf(grandparent) : '/';
        const newChildDepth = grandparent ? grandparent.depth + 1 : 0;
        const shift = newChildDepth - (task.depth + 1);

        for (const child of children) {
          const oldPrefix = subtreePrefix(child);
          const newPrefix = `${newChildPath}${child.id}/`;
          tx.update(tasks)
            .set({ parentTaskId: grandparent?.id ?? null, path: newChildPath, depth: newChildDepth })
            .where(eq(tasks.id, child.id))
            .run();
          if (oldPrefix !== newPrefix) {
            tx.update(tasks)
              .set({
                path: sql`${newPrefix} || substr(${tasks.path}, ${oldPrefix.length + 1})`,
                depth: sql`${tasks.depth} + ${shift}`,
              })
              .where(like(tasks.path, `${oldPrefix}%`))
              .run();
          }
        }
      }
      // CASCADE needs no work: the self-referencing foreign key removes the subtree.

      recordActivity(tx, {
        organizationId: auth.organizationId,
        projectId: task.projectId,
        actorId: auth.userId,
        entityType: EntityType.TASK,
        entityId: taskId,
        action: 'deleted',
        changes: { title: { from: task.title, to: null }, strategy: { from: null, to: strategy } },
      });

      repo.remove(taskId, tx);
      return { reparentedTo };
    });

    publish.toProject(
      { actorId: auth.userId, organizationId: auth.organizationId, projectId: task.projectId },
      'task.deleted',
      { taskId, columnId: task.columnId, reparentedTo: result.reparentedTo },
    );
    return result;
  },

  /* ──────────────────────────────── watchers ──────────────────────────────── */

  watch(auth: AuthContext, taskId: string, watching: boolean): void {
    const task = this.load(auth, taskId);
    if (watching) repo.addWatcher(taskId, auth.userId);
    else repo.removeWatcher(taskId, auth.userId);
    void task;
  },

  watchers(auth: AuthContext, taskId: string) {
    this.load(auth, taskId);
    return repo.watchers(taskId).map((row) => ({
      id: row.user.id,
      name: row.user.name,
      avatarColor: row.user.avatarColor,
    }));
  },
};

export { authRepository };
