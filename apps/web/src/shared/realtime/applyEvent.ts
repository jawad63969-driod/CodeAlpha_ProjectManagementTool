import type { QueryClient } from '@tanstack/react-query';
import type { BoardSnapshotDto, EventEnvelope, NotificationDto, Page, TaskDto } from '@taskforge/shared';
import { keys } from '../api/endpoints.js';

/**
 * The single place a server event touches the cache.
 *
 * Two rules keep it honest:
 *   1. Events this client caused are ignored — the optimistic update already
 *      applied them, and re-applying can resurrect a card the user just moved.
 *   2. Every patch is idempotent (upsert by id, filter by id), so a duplicate
 *      delivery changes nothing.
 */
export const applyEvent = (
  queryClient: QueryClient,
  event: EventEnvelope,
  currentUserId: string,
): void => {
  const isSelf = event.actorId === currentUserId;
  const projectId = event.projectId;

  const patchBoard = (patch: (board: BoardSnapshotDto) => BoardSnapshotDto): void => {
    if (!projectId) return;
    queryClient.setQueryData<BoardSnapshotDto>(keys.board(projectId), (board) =>
      board ? patch(board) : board,
    );
  };

  const upsertTask = (task: TaskDto): void =>
    patchBoard((board) => ({
      ...board,
      tasks: board.tasks.some((t) => t.id === task.id)
        ? board.tasks.map((t) => (t.id === task.id ? task : t))
        : [...board.tasks, task],
    }));

  switch (event.type) {
    case 'task.created':
    case 'task.updated':
      if (isSelf) return;
      upsertTask(event.payload.task);
      queryClient.setQueryData(keys.task(event.payload.task.id), { task: event.payload.task });
      return;

    case 'task.moved':
      if (isSelf) return;
      upsertTask(event.payload.task);
      return;

    case 'task.deleted':
      if (isSelf) return;
      patchBoard((board) => ({ ...board, tasks: board.tasks.filter((t) => t.id !== event.payload.taskId) }));
      queryClient.removeQueries({ queryKey: keys.task(event.payload.taskId) });
      return;

    case 'column.created':
      if (isSelf) return;
      patchBoard((board) => ({
        ...board,
        columns: board.columns.some((c) => c.id === event.payload.column.id)
          ? board.columns
          : [...board.columns, event.payload.column].sort((a, b) => a.position - b.position),
      }));
      return;

    case 'column.updated':
      if (isSelf) return;
      patchBoard((board) => ({
        ...board,
        columns: board.columns.map((c) => (c.id === event.payload.column.id ? event.payload.column : c)),
      }));
      return;

    case 'column.deleted':
      // Cards were moved server-side; a refetch is cheaper than replaying that.
      if (projectId) void queryClient.invalidateQueries({ queryKey: keys.board(projectId) });
      return;

    case 'column.reordered':
      if (isSelf) return;
      patchBoard((board) => ({ ...board, columns: event.payload.columns }));
      return;

    case 'project.updated':
      if (isSelf) return;
      patchBoard((board) => ({ ...board, project: { ...board.project, ...event.payload.project } }));
      void queryClient.invalidateQueries({ queryKey: keys.projects });
      return;

    case 'member.added':
    case 'member.updated':
    case 'member.removed':
      if (projectId) void queryClient.invalidateQueries({ queryKey: keys.board(projectId) });
      return;

    case 'comment.created':
    case 'comment.updated':
    case 'comment.deleted': {
      const taskId = event.payload.taskId;
      void queryClient.invalidateQueries({ queryKey: keys.comments(taskId) });
      void queryClient.invalidateQueries({ queryKey: keys.taskActivity(taskId) });
      if (event.type === 'comment.created' && !isSelf) {
        patchBoard((board) => ({
          ...board,
          tasks: board.tasks.map((t) => (t.id === taskId ? { ...t, commentCount: t.commentCount + 1 } : t)),
        }));
      }
      return;
    }

    case 'notification.created': {
      // Notifications are addressed to one person, so they are never self-echo.
      const incoming: NotificationDto = event.payload.notification;
      queryClient.setQueryData<Page<NotificationDto> & { unread: number }>(keys.notifications, (current) =>
        current
          ? {
              ...current,
              data: current.data.some((n) => n.id === incoming.id) ? current.data : [incoming, ...current.data],
              unread: current.unread + 1,
            }
          : current,
      );
      void queryClient.invalidateQueries({ queryKey: keys.notifications });
      return;
    }

    case 'activity.created':
      if (projectId) void queryClient.invalidateQueries({ queryKey: keys.projectActivity(projectId) });
      return;

    default:
      // presence.updated and task.dragging are handled by the presence store.
      return;
  }
};
