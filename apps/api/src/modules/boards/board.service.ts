import { and, eq, sql } from 'drizzle-orm';
import {
  EntityType,
  Permission,
  type BoardColumnDto,
  type BoardDto,
  type BoardSnapshotDto,
  type CreateColumnInput,
  type LabelDto,
  type StatusCategory,
  type UpdateColumnInput,
  type WorkflowStatusDto,
} from '@taskforge/shared';
import { db } from '../../db/client.js';
import { boardColumns, tasks, workflowStatuses } from '../../db/schema.js';
import { AppError } from '../../core/errors.js';
import { ID_PREFIX, newId } from '../../core/ids.js';
import { STEP, positionAfter } from '../../core/lexorank.js';
import { requirePermission } from '../../rbac/authorize.js';
import { recordActivity } from '../activity/activity.recorder.js';
import { publish } from '../../realtime/publisher.js';
import { projectRepository as repo } from '../projects/project.repository.js';
import { projectService, toBoardDto, toLabelDto, toStatusDto } from '../projects/project.service.js';
import { taskRepository } from '../tasks/task.repository.js';
import { attachLabels } from '../tasks/task.service.js';
import type { AuthContext } from '../../auth/context.js';

export const toColumnDto = (row: {
  column: { id: string; boardId: string; statusId: string; name: string; position: number; wipLimit: number | null };
  status: { category: string };
}): BoardColumnDto => ({
  id: row.column.id,
  boardId: row.column.boardId,
  statusId: row.column.statusId,
  name: row.column.name,
  position: row.column.position,
  wipLimit: row.column.wipLimit,
  category: row.status.category as StatusCategory,
});

/** Resolves the board to operate on: the one asked for, or the project default. */
const resolveBoard = (projectId: string, boardId?: string | null) => {
  const board = boardId ? repo.findBoard(boardId) : repo.defaultBoard(projectId);
  if (!board || board.projectId !== projectId) throw AppError.notFound('Board not found');
  return board;
};

export const boardService = {
  resolveBoard,

  /**
   * Everything the board view needs, in one round trip (FR-D §5.1): project,
   * boards, statuses, columns, tasks with their labels, project labels, members
   * and the caller's permissions. Six queries total, independent of task count.
   */
  snapshot(auth: AuthContext, projectId: string, boardId?: string): BoardSnapshotDto {
    const project = projectService.get(auth, projectId);
    const board = resolveBoard(projectId, boardId);
    const rows = taskRepository.listForBoard(board.id, false);

    return {
      project,
      board: toBoardDto(board),
      boards: repo.listBoards(projectId).map(toBoardDto),
      statuses: repo.listStatuses(projectId).map(toStatusDto),
      columns: repo.listColumns(board.id).map(toColumnDto),
      tasks: attachLabels(rows, project.key),
      labels: repo.listLabels(projectId).map(toLabelDto),
      members: projectService.listMembers(auth, projectId),
      viewMode: 'KANBAN',
      permissions: projectService.permissions(auth, projectId),
    };
  },

  listBoards(auth: AuthContext, projectId: string): BoardDto[] {
    projectService.load(auth, projectId);
    return repo.listBoards(projectId).map(toBoardDto);
  },

  createBoard(auth: AuthContext, projectId: string, name: string): BoardDto {
    projectService.load(auth, projectId);
    requirePermission(auth, Permission.BOARD_CONFIGURE, projectId);

    const boardId = newId(ID_PREFIX.board);
    return db.transaction((tx) => {
      repo.insertBoard({ id: boardId, projectId, name, isDefault: false }, tx);

      // A new board mirrors the project's existing workflow, so it is usable
      // immediately rather than arriving as an empty canvas.
      repo.listStatuses(projectId, tx).forEach((status, index) => {
        repo.insertColumn(
          {
            id: newId(ID_PREFIX.column),
            boardId,
            statusId: status.id,
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
        entityType: EntityType.BOARD,
        entityId: boardId,
        action: 'created',
        changes: { name: { from: null, to: name } },
      });

      return toBoardDto(repo.findBoard(boardId, tx)!);
    });
  },

  listStatuses(auth: AuthContext, projectId: string): WorkflowStatusDto[] {
    projectService.load(auth, projectId);
    return repo.listStatuses(projectId).map(toStatusDto);
  },

  listColumns(auth: AuthContext, projectId: string, boardId?: string): BoardColumnDto[] {
    projectService.load(auth, projectId);
    return repo.listColumns(resolveBoard(projectId, boardId).id).map(toColumnDto);
  },

  /**
   * Adding a column either binds to an existing status or creates a new one.
   * The status is the durable concept; the column is one board's view of it.
   */
  createColumn(auth: AuthContext, projectId: string, input: CreateColumnInput, boardId?: string): BoardColumnDto {
    projectService.load(auth, projectId);
    requirePermission(auth, Permission.BOARD_CONFIGURE, projectId);

    const board = resolveBoard(projectId, boardId);
    const existingColumns = repo.listColumns(board.id);

    const created = db.transaction((tx) => {
      let statusId = input.statusId ?? null;

      if (statusId) {
        const statuses = repo.listStatuses(projectId, tx);
        if (!statuses.some((s) => s.id === statusId)) {
          throw AppError.validation('That status does not belong to this project');
        }
        if (existingColumns.some((c) => c.column.statusId === statusId)) {
          throw AppError.conflict('This board already has a column for that status');
        }
      } else {
        const statuses = repo.listStatuses(projectId, tx);
        if (statuses.some((s) => s.name.toLowerCase() === input.name.toLowerCase())) {
          throw AppError.conflict(`A status named "${input.name}" already exists in this project`);
        }
        statusId = newId(ID_PREFIX.status);
        repo.insertStatus(
          {
            id: statusId,
            projectId,
            name: input.name,
            category: input.category as StatusCategory,
            position: positionAfter(statuses.at(-1)?.position ?? null),
            isInitial: false,
          },
          tx,
        );
      }

      const columnId = newId(ID_PREFIX.column);
      repo.insertColumn(
        {
          id: columnId,
          boardId: board.id,
          statusId,
          name: input.name,
          position: positionAfter(existingColumns.at(-1)?.column.position ?? null),
          wipLimit: input.wipLimit ?? null,
        },
        tx,
      );

      recordActivity(tx, {
        organizationId: auth.organizationId,
        projectId,
        actorId: auth.userId,
        entityType: EntityType.COLUMN,
        entityId: columnId,
        action: 'created',
        changes: { name: { from: null, to: input.name } },
      });

      return toColumnDto(repo.listColumns(board.id, tx).find((c) => c.column.id === columnId)!);
    });

    publish.toProject(
      { actorId: auth.userId, organizationId: auth.organizationId, projectId },
      'column.created',
      { column: created },
    );
    return created;
  },

  updateColumn(auth: AuthContext, columnId: string, input: UpdateColumnInput): BoardColumnDto {
    const found = repo.findColumn(columnId);
    if (!found) throw AppError.notFound('Column not found');
    const projectId = found.board.projectId;
    projectService.load(auth, projectId);
    requirePermission(auth, Permission.BOARD_CONFIGURE, projectId);

    const updated = db.transaction((tx) => {
      repo.updateColumn(
        columnId,
        {
          name: input.name ?? found.column.name,
          wipLimit: input.wipLimit === undefined ? found.column.wipLimit : input.wipLimit,
        },
        tx,
      );
      // The column is the board's label for a status; renaming one renames both
      // so the two never drift apart.
      if (input.name && input.name !== found.status.name) {
        tx.update(workflowStatuses).set({ name: input.name }).where(eq(workflowStatuses.id, found.column.statusId)).run();
      }
      recordActivity(tx, {
        organizationId: auth.organizationId,
        projectId,
        actorId: auth.userId,
        entityType: EntityType.COLUMN,
        entityId: columnId,
        action: 'updated',
        changes: input.name ? { name: { from: found.column.name, to: input.name } } : {},
      });
      return toColumnDto(repo.listColumns(found.board.id, tx).find((c) => c.column.id === columnId)!);
    });

    publish.toProject(
      { actorId: auth.userId, organizationId: auth.organizationId, projectId },
      'column.updated',
      { column: updated },
    );
    return updated;
  },

  /**
   * Deleting a column requires somewhere for its cards to go (FR-E-03). This is
   * enforced here rather than by a database constraint, so the caller gets a
   * clear 409 instead of an opaque foreign-key failure.
   */
  deleteColumn(auth: AuthContext, columnId: string, moveToColumnId?: string): { movedTasksTo: string | null } {
    const found = repo.findColumn(columnId);
    if (!found) throw AppError.notFound('Column not found');
    const projectId = found.board.projectId;
    projectService.load(auth, projectId);
    requirePermission(auth, Permission.BOARD_CONFIGURE, projectId);

    const columns = repo.listColumns(found.board.id);
    if (columns.length <= 1) throw AppError.conflict('A board must keep at least one column');

    const outcome = db.transaction((tx) => {
      // The occupancy check belongs INSIDE the transaction. Run outside it, a
      // card created between the count and the delete was destroyed by the
      // ON DELETE CASCADE on tasks.column_id — silently, with no 409 and no
      // activity row saying where it went. The throw rolls the transaction back.
      const occupants = tx
        .select({ n: sql<number>`count(*)` })
        .from(tasks)
        .where(eq(tasks.columnId, columnId))
        .get();
      const taskCount = Number(occupants?.n ?? 0);

      let target: (typeof columns)[number] | undefined;
      if (taskCount > 0) {
        if (!moveToColumnId) {
          throw AppError.conflict(
            `This column still holds ${taskCount} card${taskCount === 1 ? '' : 's'} — choose a column to move them to`,
          );
        }
        target = columns.find((c) => c.column.id === moveToColumnId && c.column.id !== columnId);
        if (!target) throw AppError.validation('The destination column is not on this board');
      }

      if (target) {
        const last = tx
          .select({ p: sql<number>`max(position)` })
          .from(tasks)
          .where(eq(tasks.columnId, target.column.id))
          .get();
        let next = positionAfter(Number(last?.p ?? 0) || null);

        const moving = tx.select().from(tasks).where(eq(tasks.columnId, columnId)).orderBy(tasks.position).all();
        for (const task of moving) {
          tx.update(tasks)
            .set({
              columnId: target.column.id,
              statusId: target.column.statusId,
              position: next,
              version: task.version + 1,
              resolvedAt: target.status.category === 'DONE' ? (task.resolvedAt ?? new Date().toISOString()) : null,
            })
            .where(eq(tasks.id, task.id))
            .run();
          next += STEP;
        }
      }

      repo.removeColumn(columnId, tx);
      recordActivity(tx, {
        organizationId: auth.organizationId,
        projectId,
        actorId: auth.userId,
        entityType: EntityType.COLUMN,
        entityId: columnId,
        action: 'deleted',
        changes: { movedTasksTo: { from: null, to: target?.column.id ?? null } },
      });
      return { movedTasksTo: target?.column.id ?? null };
    });

    publish.toProject(
      { actorId: auth.userId, organizationId: auth.organizationId, projectId },
      'column.deleted',
      { columnId, movedTasksTo: outcome.movedTasksTo },
    );
    return outcome;
  },

  reorderColumns(auth: AuthContext, projectId: string, orderedColumnIds: string[], boardId?: string): BoardColumnDto[] {
    projectService.load(auth, projectId);
    requirePermission(auth, Permission.BOARD_CONFIGURE, projectId);

    const board = resolveBoard(projectId, boardId);
    const existing = repo.listColumns(board.id);
    const known = new Set(existing.map((c) => c.column.id));
    if (orderedColumnIds.length !== existing.length || orderedColumnIds.some((id) => !known.has(id))) {
      throw AppError.validation('The new order must list every column on this board exactly once');
    }

    const columns = db.transaction((tx) => {
      orderedColumnIds.forEach((id, index) => {
        repo.updateColumn(id, { position: (index + 1) * STEP }, tx);
      });
      return repo.listColumns(board.id, tx).map(toColumnDto);
    });

    publish.toProject(
      { actorId: auth.userId, organizationId: auth.organizationId, projectId },
      'column.reordered',
      { columns },
    );
    return columns;
  },

  /* ----------------------------------------------------------------- labels */

  listLabels(auth: AuthContext, projectId: string): LabelDto[] {
    projectService.load(auth, projectId);
    return repo.listLabels(projectId).map(toLabelDto);
  },

  createLabel(auth: AuthContext, projectId: string, name: string, color: string): LabelDto {
    projectService.load(auth, projectId);
    requirePermission(auth, Permission.BOARD_CONFIGURE, projectId);
    if (repo.listLabels(projectId).some((l) => l.name.toLowerCase() === name.toLowerCase())) {
      throw AppError.conflict(`A label named "${name}" already exists`);
    }
    const id = newId(ID_PREFIX.label);
    repo.insertLabel({ id, projectId, name, color });
    return { id, name, color };
  },

  deleteLabel(auth: AuthContext, projectId: string, labelId: string): void {
    projectService.load(auth, projectId);
    requirePermission(auth, Permission.BOARD_CONFIGURE, projectId);
    const label = repo.listLabels(projectId).find((l) => l.id === labelId);
    if (!label) throw AppError.notFound('Label not found');
    repo.removeLabel(labelId);
  },
};

export { and };
