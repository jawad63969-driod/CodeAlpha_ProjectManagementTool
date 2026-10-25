import { asc, eq } from 'drizzle-orm';
import {
  EntityType,
  NotificationType,
  Permission,
  type CommentDto,
  type CreateCommentInput,
  type UpdateCommentInput,
  type UserRefDto,
} from '@taskforge/shared';
import { db, type Executor } from '../../db/client.js';
import { commentMentions, comments, users } from '../../db/schema.js';
import { AppError } from '../../core/errors.js';
import { ID_PREFIX, newId } from '../../core/ids.js';
import { nowIso } from '../../core/result.js';
import { requirePermission } from '../../rbac/authorize.js';
import { recordActivity } from '../activity/activity.recorder.js';
import { projectRepository } from '../projects/project.repository.js';
import { taskRepository } from '../tasks/task.repository.js';
import { taskService } from '../tasks/task.service.js';
import { notificationService, type NotificationSeed } from '../notifications/notification.service.js';
import { publish, type EventOrigin } from '../../realtime/publisher.js';
import type { AuthContext } from '../../auth/context.js';

const MENTION_PATTERN = /@([\w][\w.-]{1,40})/g;

const loadComment = (commentId: string, organizationId: string, tx: Executor = db) =>
  tx
    .select()
    .from(comments)
    .where(eq(comments.id, commentId))
    .get();

const hydrate = (commentId: string, tx: Executor = db): CommentDto => {
  const row = tx
    .select({ comment: comments, author: users })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.id, commentId))
    .get()!;

  const mentions = tx
    .select({ user: users })
    .from(commentMentions)
    .innerJoin(users, eq(users.id, commentMentions.userId))
    .where(eq(commentMentions.commentId, commentId))
    .all()
    .map(({ user }): UserRefDto => ({ id: user.id, name: user.name, avatarColor: user.avatarColor }));

  return {
    id: row.comment.id,
    taskId: row.comment.taskId,
    parentCommentId: row.comment.parentCommentId,
    body: row.comment.body,
    author: row.author
      ? { id: row.author.id, name: row.author.name, avatarColor: row.author.avatarColor }
      : null,
    mentions,
    editedAt: row.comment.editedAt,
    createdAt: row.comment.createdAt,
  };
};

/**
 * Resolves `@handles` against the people on the project. Matching is by first
 * name or email local-part, both lower-cased. Mentions are stored relationally
 * (FR-H-04) so the notification never depends on re-parsing prose later.
 */
const resolveMentions = (body: string, projectId: string): string[] => {
  const handles = new Set([...body.matchAll(MENTION_PATTERN)].map((match) => match[1]!.toLowerCase()));
  if (handles.size === 0) return [];

  return projectRepository
    .listMembers(projectId)
    .filter(({ user }) => {
      const firstName = user.name.split(/\s+/)[0]?.toLowerCase() ?? '';
      const localPart = user.email.split('@')[0]?.toLowerCase() ?? '';
      return handles.has(firstName) || handles.has(localPart);
    })
    .map(({ user }) => user.id);
};

export const commentService = {
  list(auth: AuthContext, taskId: string): CommentDto[] {
    taskService.load(auth, taskId);
    return db
      .select({ id: comments.id })
      .from(comments)
      .where(eq(comments.taskId, taskId))
      .orderBy(asc(comments.createdAt), asc(comments.id))
      .all()
      .map((row) => hydrate(row.id));
  },

  create(auth: AuthContext, taskId: string, input: CreateCommentInput): CommentDto {
    const task = taskService.load(auth, taskId);
    requirePermission(auth, Permission.COMMENT_CREATE, task.projectId);

    // Threads are one level deep (FR-H-02). Replying to a reply attaches to the
    // root rather than failing — the user's intent is obvious either way.
    let parentCommentId: string | null = null;
    if (input.parentCommentId) {
      const parent = loadComment(input.parentCommentId, auth.organizationId);
      if (!parent || parent.taskId !== taskId) {
        throw AppError.validation('That comment is not on this task');
      }
      parentCommentId = parent.parentCommentId ?? parent.id;
    }

    const mentionedIds = resolveMentions(input.body, task.projectId);
    const commentId = newId(ID_PREFIX.comment);
    const origin: EventOrigin = {
      actorId: auth.userId,
      organizationId: auth.organizationId,
      projectId: task.projectId,
    };

    const { dto, notificationIds } = db.transaction((tx) => {
      tx.insert(comments)
        .values({
          id: commentId,
          organizationId: auth.organizationId,
          taskId,
          authorId: auth.userId,
          parentCommentId,
          body: input.body,
        })
        .run();

      for (const userId of mentionedIds) {
        tx.insert(commentMentions).values({ commentId, userId }).onConflictDoNothing().run();
      }

      // Commenting on a task is an act of interest in it.
      taskRepository.addWatcher(taskId, auth.userId, tx);

      const seeds: NotificationSeed[] = [
        ...notificationService.watcherIds(tx, taskId, auth.userId).map((userId) => ({
          userId,
          type: NotificationType.COMMENT_CREATED,
          message: `commented on ${task.title}`,
          taskId,
          commentId,
        })),
        ...mentionedIds.map((userId) => ({
          userId,
          type: NotificationType.MENTIONED,
          message: `mentioned you in ${task.title}`,
          taskId,
          commentId,
        })),
      ];

      recordActivity(tx, {
        organizationId: auth.organizationId,
        projectId: task.projectId,
        actorId: auth.userId,
        entityType: EntityType.COMMENT,
        entityId: commentId,
        action: 'created',
        changes: { taskId: { from: null, to: taskId } },
      });

      return {
        dto: hydrate(commentId, tx),
        notificationIds: notificationService.create(tx, origin, seeds),
      };
    });

    publish.toProject({ ...origin, projectId: task.projectId }, 'comment.created', { comment: dto, taskId });
    notificationService.deliver(origin, notificationIds);
    return dto;
  },

  update(auth: AuthContext, commentId: string, input: UpdateCommentInput): CommentDto {
    const existing = loadComment(commentId, auth.organizationId);
    if (!existing) throw AppError.notFound('Comment not found');
    const task = taskService.load(auth, existing.taskId);

    if (existing.authorId !== auth.userId) throw AppError.forbidden('You can only edit your own comments');
    requirePermission(auth, Permission.COMMENT_UPDATE_OWN, task.projectId);

    const mentionedIds = resolveMentions(input.body, task.projectId);

    const dto = db.transaction((tx) => {
      tx.update(comments)
        .set({ body: input.body, editedAt: nowIso() })
        .where(eq(comments.id, commentId))
        .run();

      tx.delete(commentMentions).where(eq(commentMentions.commentId, commentId)).run();
      for (const userId of mentionedIds) {
        tx.insert(commentMentions).values({ commentId, userId }).onConflictDoNothing().run();
      }
      return hydrate(commentId, tx);
    });

    publish.toProject(
      { actorId: auth.userId, organizationId: auth.organizationId, projectId: task.projectId },
      'comment.updated',
      { comment: dto, taskId: existing.taskId },
    );
    return dto;
  },

  remove(auth: AuthContext, commentId: string): void {
    const existing = loadComment(commentId, auth.organizationId);
    if (!existing) throw AppError.notFound('Comment not found');
    const task = taskService.load(auth, existing.taskId);

    if (existing.authorId !== auth.userId) {
      requirePermission(auth, Permission.COMMENT_DELETE_ANY, task.projectId);
    } else {
      requirePermission(auth, Permission.COMMENT_CREATE, task.projectId);
    }

    db.transaction((tx) => {
      recordActivity(tx, {
        organizationId: auth.organizationId,
        projectId: task.projectId,
        actorId: auth.userId,
        entityType: EntityType.COMMENT,
        entityId: commentId,
        action: 'deleted',
      });
      // Replies go with their root — the self-referencing key cascades.
      tx.delete(comments).where(eq(comments.id, commentId)).run();
    });

    publish.toProject(
      { actorId: auth.userId, organizationId: auth.organizationId, projectId: task.projectId },
      'comment.deleted',
      { commentId, taskId: existing.taskId },
    );
  },
};
