import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, type Executor } from '../../db/client.js';
import {
  boardColumns, boards, labels, projectMembers, projects, tasks, users, workflowStatuses,
} from '../../db/schema.js';

/**
 * Drizzle renders `projects.id` as a bare `"id"` when the query has no join.
 * Inside a correlated subquery that binds to the SUBQUERY's own `id` column,
 * silently matching nothing. Qualifying it explicitly is the fix.
 */
const OUTER_PROJECT_ID = sql.raw('"projects"."id"');

export const projectRepository = {
  insert: (row: typeof projects.$inferInsert, tx: Executor = db) =>
    tx.insert(projects).values(row).run(),

  findById: (id: string, organizationId: string, tx: Executor = db) =>
    tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.organizationId, organizationId)))
      .get(),

  findByKey: (key: string, organizationId: string, tx: Executor = db) =>
    tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.key, key), eq(projects.organizationId, organizationId)))
      .get(),

  update: (id: string, patch: Partial<typeof projects.$inferInsert>, tx: Executor = db) =>
    tx.update(projects).set(patch).where(eq(projects.id, id)).run(),

  remove: (id: string, tx: Executor = db) => tx.delete(projects).where(eq(projects.id, id)).run(),

  /**
   * Projects the caller can see, with their counts. The counts are correlated
   * subqueries rather than follow-up queries, so listing N projects is one
   * round trip regardless of N (NFR-03).
   */
  listVisible: (
    organizationId: string,
    userId: string,
    options: { seesEverything: boolean; includeArchived: boolean },
    tx: Executor = db,
  ) => {
    const memberFilter = options.seesEverything
      ? sql`1 = 1`
      : sql`exists (select 1 from ${projectMembers} pm
                     where pm.project_id = ${OUTER_PROJECT_ID} and pm.user_id = ${userId})`;
    const archivedFilter = options.includeArchived ? sql`1 = 1` : isNull(projects.archivedAt);

    return tx
      .select({
        project: projects,
        role: sql<string | null>`(select pm.role from ${projectMembers} pm
                                   where pm.project_id = ${OUTER_PROJECT_ID} and pm.user_id = ${userId})`,
        memberCount: sql<number>`(select count(*) from ${projectMembers} pm where pm.project_id = ${OUTER_PROJECT_ID})`,
        taskCount: sql<number>`(select count(*) from ${tasks} t
                                 where t.project_id = ${OUTER_PROJECT_ID} and t.archived_at is null)`,
        doneCount: sql<number>`(select count(*) from ${tasks} t
                                 where t.project_id = ${OUTER_PROJECT_ID} and t.archived_at is null
                                   and t.resolved_at is not null)`,
      })
      .from(projects)
      .where(and(eq(projects.organizationId, organizationId), memberFilter, archivedFilter))
      .orderBy(desc(projects.updatedAt))
      .all();
  },

  counts: (projectId: string, tx: Executor = db) =>
    tx
      .select({
        memberCount: sql<number>`(select count(*) from ${projectMembers} pm where pm.project_id = ${projectId})`,
        taskCount: sql<number>`(select count(*) from ${tasks} t where t.project_id = ${projectId} and t.archived_at is null)`,
        doneCount: sql<number>`(select count(*) from ${tasks} t where t.project_id = ${projectId} and t.archived_at is null and t.resolved_at is not null)`,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .get(),

  /** Atomic per-project counter behind the KEY-N reference (DATA-MODEL §6.1). */
  nextTaskNumber: (projectId: string, tx: Executor): number => {
    tx.update(projects)
      .set({ taskSequence: sql`${projects.taskSequence} + 1` })
      .where(eq(projects.id, projectId))
      .run();
    const row = tx
      .select({ n: projects.taskSequence })
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();
    return row?.n ?? 1;
  },

  /* ---- membership ---- */

  insertMember: (row: typeof projectMembers.$inferInsert, tx: Executor = db) =>
    tx.insert(projectMembers).values(row).run(),

  findMember: (projectId: string, userId: string, tx: Executor = db) =>
    tx
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .get(),

  listMembers: (projectId: string, tx: Executor = db) =>
    tx
      .select({ member: projectMembers, user: users })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId))
      .all(),

  updateMember: (projectId: string, userId: string, role: string, tx: Executor = db) =>
    tx
      .update(projectMembers)
      .set({ role })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .run(),

  removeMember: (projectId: string, userId: string, tx: Executor = db) =>
    tx
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .run(),

  /* ---- board furniture ---- */

  insertBoard: (row: typeof boards.$inferInsert, tx: Executor = db) =>
    tx.insert(boards).values(row).run(),

  listBoards: (projectId: string, tx: Executor = db) =>
    tx.select().from(boards).where(eq(boards.projectId, projectId)).all(),

  findBoard: (boardId: string, tx: Executor = db) =>
    tx.select().from(boards).where(eq(boards.id, boardId)).get(),

  defaultBoard: (projectId: string, tx: Executor = db) =>
    tx
      .select()
      .from(boards)
      .where(and(eq(boards.projectId, projectId), eq(boards.isDefault, true)))
      .get(),

  insertStatus: (row: typeof workflowStatuses.$inferInsert, tx: Executor = db) =>
    tx.insert(workflowStatuses).values(row).run(),

  listStatuses: (projectId: string, tx: Executor = db) =>
    tx
      .select()
      .from(workflowStatuses)
      .where(eq(workflowStatuses.projectId, projectId))
      .orderBy(workflowStatuses.position)
      .all(),

  insertColumn: (row: typeof boardColumns.$inferInsert, tx: Executor = db) =>
    tx.insert(boardColumns).values(row).run(),

  listColumns: (boardId: string, tx: Executor = db) =>
    tx
      .select({ column: boardColumns, status: workflowStatuses })
      .from(boardColumns)
      .innerJoin(workflowStatuses, eq(workflowStatuses.id, boardColumns.statusId))
      .where(eq(boardColumns.boardId, boardId))
      .orderBy(boardColumns.position)
      .all(),

  findColumn: (columnId: string, tx: Executor = db) =>
    tx
      .select({ column: boardColumns, status: workflowStatuses, board: boards })
      .from(boardColumns)
      .innerJoin(workflowStatuses, eq(workflowStatuses.id, boardColumns.statusId))
      .innerJoin(boards, eq(boards.id, boardColumns.boardId))
      .where(eq(boardColumns.id, columnId))
      .get(),

  updateColumn: (columnId: string, patch: Partial<typeof boardColumns.$inferInsert>, tx: Executor = db) =>
    tx.update(boardColumns).set(patch).where(eq(boardColumns.id, columnId)).run(),

  removeColumn: (columnId: string, tx: Executor = db) =>
    tx.delete(boardColumns).where(eq(boardColumns.id, columnId)).run(),

  /* ---- labels ---- */

  insertLabel: (row: typeof labels.$inferInsert, tx: Executor = db) =>
    tx.insert(labels).values(row).run(),

  listLabels: (projectId: string, tx: Executor = db) =>
    tx.select().from(labels).where(eq(labels.projectId, projectId)).all(),

  findLabelsByIds: (ids: string[], projectId: string, tx: Executor = db) =>
    ids.length === 0
      ? []
      : tx
          .select()
          .from(labels)
          .where(and(eq(labels.projectId, projectId), inArray(labels.id, ids)))
          .all(),

  removeLabel: (labelId: string, tx: Executor = db) =>
    tx.delete(labels).where(eq(labels.id, labelId)).run(),
};
