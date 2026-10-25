import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import {
  NotificationType,
  type NotificationDto,
  type NotificationType as NotificationTypeValue,
} from '@taskforge/shared';
import { db, type Executor } from '../../db/client.js';
import { notifications, taskWatchers, users } from '../../db/schema.js';
import { ID_PREFIX, newId } from '../../core/ids.js';
import { nowIso, toPage } from '../../core/result.js';
import { publish, type EventOrigin } from '../../realtime/publisher.js';
import type { AuthContext } from '../../auth/context.js';

export interface NotificationSeed {
  userId: string;
  type: NotificationTypeValue;
  message: string;
  projectId?: string | null;
  taskId?: string | null;
  commentId?: string | null;
}

const toDto = (row: {
  notification: typeof notifications.$inferSelect;
  actor: { id: string; name: string; avatarColor: string } | null;
}): NotificationDto => ({
  id: row.notification.id,
  type: row.notification.type as NotificationTypeValue,
  message: row.notification.message,
  projectId: row.notification.projectId,
  taskId: row.notification.taskId,
  commentId: row.notification.commentId,
  actor: row.actor ? { id: row.actor.id, name: row.actor.name, avatarColor: row.actor.avatarColor } : null,
  readAt: row.notification.readAt,
  createdAt: row.notification.createdAt,
});

export const notificationService = {
  /**
   * Writes notification rows inside the caller's transaction and returns the
   * ids. Delivery happens separately, after the commit — see `deliver`.
   *
   * Notifying yourself is filtered here and forbidden by a CHECK constraint, so
   * it cannot slip through either layer.
   */
  create(tx: Executor, origin: EventOrigin, seeds: NotificationSeed[]): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();

    for (const seed of seeds) {
      if (seed.userId === origin.actorId) continue;
      const key = `${seed.userId}:${seed.type}:${seed.taskId ?? ''}:${seed.commentId ?? ''}`;
      if (seen.has(key)) continue; // one notification per person per event
      seen.add(key);

      const id = newId(ID_PREFIX.notification);
      tx.insert(notifications)
        .values({
          id,
          organizationId: origin.organizationId,
          userId: seed.userId,
          actorId: origin.actorId,
          type: seed.type,
          message: seed.message,
          projectId: seed.projectId ?? origin.projectId,
          taskId: seed.taskId ?? null,
          commentId: seed.commentId ?? null,
        })
        .run();
      ids.push(id);
    }
    return ids;
  },

  /** Pushes freshly created notifications to their recipients' personal rooms. */
  deliver(origin: EventOrigin, ids: string[]): void {
    if (ids.length === 0) return;
    for (const id of ids) {
      const row = db
        .select({ notification: notifications, actor: users })
        .from(notifications)
        .leftJoin(users, eq(users.id, notifications.actorId))
        .where(eq(notifications.id, id))
        .get();
      if (!row) continue;
      publish.toUser(row.notification.userId, origin, 'notification.created', { notification: toDto(row) });
    }
  },

  /** Everyone watching a task, minus the person who caused the event. */
  watcherIds(tx: Executor, taskId: string, exceptUserId: string): string[] {
    return tx
      .select({ userId: taskWatchers.userId })
      .from(taskWatchers)
      .where(eq(taskWatchers.taskId, taskId))
      .all()
      .map((row) => row.userId)
      .filter((userId) => userId !== exceptUserId);
  },

  list(auth: AuthContext, limit: number, cursor: string | null, unreadOnly: boolean) {
    const rows = db
      .select({ notification: notifications, actor: users })
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.actorId))
      .where(
        and(
          eq(notifications.userId, auth.userId),
          eq(notifications.organizationId, auth.organizationId),
          unreadOnly ? isNull(notifications.readAt) : sql`1 = 1`,
          cursor ? lt(notifications.id, cursor) : sql`1 = 1`,
        ),
      )
      .orderBy(desc(notifications.id))
      .limit(limit + 1)
      .all();

    return { ...toPage(rows.map(toDto), limit), unread: this.unreadCount(auth) };
  },

  /** Served entirely by the (user_id, read_at, created_at) index. */
  unreadCount(auth: AuthContext): number {
    const row = db
      .select({ n: sql<number>`count(*)` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, auth.userId),
          eq(notifications.organizationId, auth.organizationId),
          isNull(notifications.readAt),
        ),
      )
      .get();
    return Number(row?.n ?? 0);
  },

  markRead(auth: AuthContext, notificationId: string): void {
    db.update(notifications)
      .set({ readAt: nowIso() })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, auth.userId)))
      .run();
  },

  markAllRead(auth: AuthContext): number {
    return db
      .update(notifications)
      .set({ readAt: nowIso() })
      .where(
        and(
          eq(notifications.userId, auth.userId),
          eq(notifications.organizationId, auth.organizationId),
          isNull(notifications.readAt),
        ),
      )
      .run().changes;
  },
};

export { NotificationType };
