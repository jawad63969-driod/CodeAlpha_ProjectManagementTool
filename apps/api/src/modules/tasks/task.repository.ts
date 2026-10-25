import { and, asc, desc, eq, inArray, isNull, like, lt, or, sql } from 'drizzle-orm';
import { db, type Executor } from '../../db/client.js';
import { attachments, comments, labels, taskLabels, taskWatchers, tasks, users } from '../../db/schema.js';

/** Columns of the aggregate that accompanies every task in a response. */
const counts = {
  commentCount: sql<number>`(select count(*) from ${comments} c where c.task_id = ${sql.raw('"tasks"."id"')})`,
  attachmentCount: sql<number>`(select count(*) from ${attachments} a where a.task_id = ${sql.raw('"tasks"."id"')})`,
  subtaskCount: sql<number>`(select count(*) from ${tasks} s where s.parent_task_id = ${sql.raw('"tasks"."id"')} and s.archived_at is null)`,
  subtaskDoneCount: sql<number>`(select count(*) from ${tasks} s where s.parent_task_id = ${sql.raw('"tasks"."id"')} and s.archived_at is null and s.resolved_at is not null)`,
};

export type TaskWithCounts = { task: typeof tasks.$inferSelect } & {
  commentCount: number; attachmentCount: number; subtaskCount: number; subtaskDoneCount: number;
};

/** The urgency ordering used by "My Work", shared by the sort and the cursor. */
const PRIORITY_RANK = sql`case ${tasks.priority} when 'CRITICAL' then 0 when 'HIGH' then 1 when 'MEDIUM' then 2 when 'LOW' then 3 else 4 end`;
const DUE_SORT = sql`coalesce(${tasks.dueDate}, '9999-12-31')`;

/** `rank|due|id`. Ids are base32 with no separator, so this parse is unambiguous. */
export const encodeWorkCursor = (rank: number, due: string, id: string): string => `${rank}|${due}|${id}`;

const decodeWorkCursor = (cursor: string | null): { rank: number; due: string; id: string } | null => {
  if (!cursor) return null;
  const parts = cursor.split('|');
  if (parts.length !== 3) return null;
  const rank = Number(parts[0]);
  if (!Number.isInteger(rank) || !parts[1] || !parts[2]) return null;
  return { rank, due: parts[1], id: parts[2] };
};

export const taskRepository = {
  insert: (row: typeof tasks.$inferInsert, tx: Executor = db) => tx.insert(tasks).values(row).run(),

  /** Raw row, scoped to the tenant so a foreign id reads as missing. */
  findById: (id: string, organizationId: string, tx: Executor = db) =>
    tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.organizationId, organizationId)))
      .get(),

  findWithCounts: (id: string, organizationId: string, tx: Executor = db) =>
    tx
      .select({ task: tasks, ...counts })
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.organizationId, organizationId)))
      .get(),

  /** Every task on a board, ordered for rendering — one query, no N+1. */
  listForBoard: (boardId: string, includeArchived: boolean, tx: Executor = db) =>
    tx
      .select({ task: tasks, ...counts })
      .from(tasks)
      .where(and(eq(tasks.boardId, boardId), includeArchived ? sql`1 = 1` : isNull(tasks.archivedAt)))
      .orderBy(asc(tasks.columnId), asc(tasks.position))
      .all(),

  listForProject: (projectId: string, includeArchived: boolean, tx: Executor = db) =>
    tx
      .select({ task: tasks, ...counts })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), includeArchived ? sql`1 = 1` : isNull(tasks.archivedAt)))
      .orderBy(asc(tasks.position))
      .all(),

  /** Cursor page of everything open and assigned to one person, most urgent first. */
  /**
   * "My Work", ordered by urgency.
   *
   * The cursor has to encode the WHOLE sort key. It used to be the row id while
   * the ORDER BY was (priority, due date, id): the two disagreed, so `id < cursor`
   * cut across the urgency ordering and pages silently dropped some rows and
   * repeated others. Measured on ten tasks at limit=3: nine rows returned, six
   * distinct, four never returned at all.
   *
   * A row-value comparison against the same three expressions is exact, and
   * SQLite and Postgres both support it.
   */
  listAssigned: (userId: string, organizationId: string, limit: number, cursor: string | null, tx: Executor = db) => {
    const after = decodeWorkCursor(cursor);
    return tx
      .select({ task: tasks, ...counts })
      .from(tasks)
      .where(
        and(
          eq(tasks.assigneeId, userId),
          eq(tasks.organizationId, organizationId),
          isNull(tasks.resolvedAt),
          isNull(tasks.archivedAt),
          after
            ? sql`(${PRIORITY_RANK}, ${DUE_SORT}, ${tasks.id}) > (${after.rank}, ${after.due}, ${after.id})`
            : sql`1 = 1`,
        ),
      )
      .orderBy(PRIORITY_RANK, DUE_SORT, asc(tasks.id))
      .limit(limit + 1)
      .all();
  },

  update: (id: string, patch: Partial<typeof tasks.$inferInsert>, tx: Executor = db) =>
    tx.update(tasks).set(patch).where(eq(tasks.id, id)).run(),

  /**
   * Optimistic concurrency (FR-F-14): the write only lands if the version the
   * caller read is still current. Zero rows changed means someone else won.
   */
  updateIfVersion: (id: string, expectedVersion: number, patch: Partial<typeof tasks.$inferInsert>, tx: Executor = db) =>
    tx
      .update(tasks)
      .set({ ...patch, version: sql`${tasks.version} + 1` })
      .where(and(eq(tasks.id, id), eq(tasks.version, expectedVersion)))
      .run().changes,

  remove: (id: string, tx: Executor = db) => tx.delete(tasks).where(eq(tasks.id, id)).run(),

  /* ---- ordering ---- */

  positionsInColumn: (columnId: string, excludeTaskId: string | null, tx: Executor = db) =>
    tx
      .select({ id: tasks.id, position: tasks.position })
      .from(tasks)
      .where(and(eq(tasks.columnId, columnId), excludeTaskId ? sql`${tasks.id} <> ${excludeTaskId}` : sql`1 = 1`))
      .orderBy(asc(tasks.position))
      .all(),

  /* ---- hierarchy ---- */

  /** Direct children. */
  children: (parentId: string, tx: Executor = db) =>
    tx.select().from(tasks).where(eq(tasks.parentTaskId, parentId)).orderBy(asc(tasks.position)).all(),

  /**
   * Whole subtree in one indexed prefix scan — the reason `path` is stored
   * (DATA-MODEL §6.2). A recursive walk would be one query per level.
   */
  descendants: (task: { id: string; path: string }, tx: Executor = db) =>
    tx
      .select()
      .from(tasks)
      .where(like(tasks.path, `${task.path}${task.id}/%`))
      .all(),

  maxDescendantDepth: (task: { id: string; path: string }, tx: Executor = db): number => {
    const row = tx
      .select({ d: sql<number>`max(depth)` })
      .from(tasks)
      .where(like(tasks.path, `${task.path}${task.id}/%`))
      .get();
    return Number(row?.d ?? 0);
  },

  /* ---- labels & watchers ---- */

  setLabels: (taskId: string, labelIds: string[], tx: Executor = db) => {
    tx.delete(taskLabels).where(eq(taskLabels.taskId, taskId)).run();
    for (const labelId of labelIds) tx.insert(taskLabels).values({ taskId, labelId }).run();
  },

  labelsForTasks: (taskIds: string[], tx: Executor = db) =>
    taskIds.length === 0
      ? []
      : tx
          .select({ taskId: taskLabels.taskId, label: labels })
          .from(taskLabels)
          .innerJoin(labels, eq(labels.id, taskLabels.labelId))
          .where(inArray(taskLabels.taskId, taskIds))
          .all(),

  addWatcher: (taskId: string, userId: string, tx: Executor = db) =>
    tx.insert(taskWatchers).values({ taskId, userId }).onConflictDoNothing().run(),

  removeWatcher: (taskId: string, userId: string, tx: Executor = db) =>
    tx.delete(taskWatchers).where(and(eq(taskWatchers.taskId, taskId), eq(taskWatchers.userId, userId))).run(),

  watchers: (taskId: string, tx: Executor = db) =>
    tx
      .select({ user: users })
      .from(taskWatchers)
      .innerJoin(users, eq(users.id, taskWatchers.userId))
      .where(eq(taskWatchers.taskId, taskId))
      .all(),
};

export { or };
