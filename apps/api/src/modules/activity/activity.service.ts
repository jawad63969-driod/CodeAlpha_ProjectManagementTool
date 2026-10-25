import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { Permission, type ActivityDto, type EntityType } from '@taskforge/shared';
import { db } from '../../db/client.js';
import { activities, users } from '../../db/schema.js';
import { toPage } from '../../core/result.js';
import { requirePermission } from '../../rbac/authorize.js';
import { projectService } from '../projects/project.service.js';
import { taskService } from '../tasks/task.service.js';
import type { AuthContext } from '../../auth/context.js';

const toDto = (row: {
  activity: typeof activities.$inferSelect;
  actor: { id: string; name: string; avatarColor: string } | null;
}): ActivityDto => ({
  id: row.activity.id,
  projectId: row.activity.projectId,
  entityType: row.activity.entityType as EntityType,
  entityId: row.activity.entityId,
  action: row.activity.action,
  changes: JSON.parse(row.activity.changesJson) as ActivityDto['changes'],
  actor: row.actor ? { id: row.actor.id, name: row.actor.name, avatarColor: row.actor.avatarColor } : null,
  createdAt: row.activity.createdAt,
});

export const activityService = {
  /** Project feed, newest first, cursor paginated (FR-I-03). */
  forProject(auth: AuthContext, projectId: string, limit: number, cursor: string | null) {
    projectService.load(auth, projectId);
    const rows = db
      .select({ activity: activities, actor: users })
      .from(activities)
      .leftJoin(users, eq(users.id, activities.actorId))
      .where(and(eq(activities.projectId, projectId), cursor ? lt(activities.id, cursor) : sql`1 = 1`))
      .orderBy(desc(activities.id))
      .limit(limit + 1)
      .all();
    return toPage(rows.map(toDto), limit);
  },

  /**
   * One task's timeline (FR-I-04). Comments on the task are included, which is
   * what makes the polymorphic entity reference earn its keep: a single ordered
   * query spans field changes and discussion.
   */
  forTask(auth: AuthContext, taskId: string, limit: number, cursor: string | null) {
    taskService.load(auth, taskId);
    const commentIds = db
      .select({ id: activities.entityId })
      .from(activities)
      .where(and(eq(activities.entityType, 'COMMENT'), sql`json_extract(${activities.changesJson}, '$.taskId.to') = ${taskId}`))
      .all()
      .map((row) => row.id);

    const rows = db
      .select({ activity: activities, actor: users })
      .from(activities)
      .leftJoin(users, eq(users.id, activities.actorId))
      .where(
        and(
          or(
            and(eq(activities.entityType, 'TASK'), eq(activities.entityId, taskId)),
            commentIds.length > 0
              ? sql`${activities.entityId} in ${commentIds}`
              : sql`0 = 1`,
          ),
          cursor ? lt(activities.id, cursor) : sql`1 = 1`,
        ),
      )
      .orderBy(desc(activities.id))
      .limit(limit + 1)
      .all();
    return toPage(rows.map(toDto), limit);
  },

  /** Workspace-wide feed, for admins reviewing what happened (FR-I-01). */
  forOrganization(auth: AuthContext, limit: number, cursor: string | null) {
    requirePermission(auth, Permission.ORG_ACTIVITY_READ);
    const rows = db
      .select({ activity: activities, actor: users })
      .from(activities)
      .leftJoin(users, eq(users.id, activities.actorId))
      .where(
        and(
          eq(activities.organizationId, auth.organizationId),
          cursor ? lt(activities.id, cursor) : sql`1 = 1`,
        ),
      )
      .orderBy(desc(activities.id))
      .limit(limit + 1)
      .all();
    return toPage(rows.map(toDto), limit);
  },
};
