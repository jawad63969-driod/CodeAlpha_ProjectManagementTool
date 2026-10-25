import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BoardSnapshotDto, TaskDto } from '@taskforge/shared';
import { endpoints, keys } from '../../shared/api/endpoints.js';
import { ApiError } from '../../shared/api/client.js';
import { useToast } from '../../shared/ui/Toast.jsx';

export const useBoard = (projectId: string) =>
  useQuery({ queryKey: keys.board(projectId), queryFn: () => endpoints.board(projectId) });

/** Mirrors the server's sparse fractional ranking so an optimistic move lands where the drop did. */
const STEP = 1024;
const positionAt = (siblings: number[], index: number): number => {
  const bounded = Math.max(0, Math.min(index, siblings.length));
  const before = bounded > 0 ? siblings[bounded - 1] : undefined;
  const after = bounded < siblings.length ? siblings[bounded] : undefined;
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (before !== undefined) return before + STEP;
  if (after !== undefined) return after - STEP;
  return STEP;
};

export const useBoardMutations = (projectId: string) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const boardKey = keys.board(projectId);

  const patchBoard = (patch: (board: BoardSnapshotDto) => BoardSnapshotDto): BoardSnapshotDto | undefined => {
    const previous = queryClient.getQueryData<BoardSnapshotDto>(boardKey);
    if (previous) queryClient.setQueryData<BoardSnapshotDto>(boardKey, patch(previous));
    return previous;
  };

  const createTask = useMutation({
    mutationFn: ({ columnId, title }: { columnId: string; title: string }) =>
      endpoints.createTask(projectId, { title, columnId }),
    onSuccess: ({ task }) => {
      patchBoard((board) => ({
        ...board,
        tasks: board.tasks.some((t) => t.id === task.id) ? board.tasks : [...board.tasks, task],
      }));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not create that card'),
  });

  /**
   * Optimistic move: the card lands under the cursor immediately, the request
   * follows, and a failure rolls the cache back to the snapshot taken here.
   */
  const moveTask = useMutation({
    mutationFn: ({ taskId, columnId, index, version }: { taskId: string; columnId: string; index: number; version: number }) =>
      endpoints.moveTask(taskId, { columnId, index, version }),
    onMutate: ({ taskId, columnId, index }) => {
      const previous = patchBoard((board) => {
        const moving = board.tasks.find((t) => t.id === taskId);
        if (!moving) return board;
        const siblings = board.tasks
          .filter((t) => t.columnId === columnId && t.id !== taskId)
          .sort((a, b) => a.position - b.position)
          .map((t) => t.position);
        const position = positionAt(siblings, index);
        return {
          ...board,
          tasks: board.tasks.map((t) => (t.id === taskId ? { ...t, columnId, position } : t)),
        };
      });
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(boardKey, context.previous);
      const message = error instanceof ApiError && error.code === 'VERSION_CONFLICT'
        ? 'Someone else moved that card first — the board has been refreshed'
        : error instanceof ApiError ? error.message : 'Could not move that card';
      toast.error(message);
      void queryClient.invalidateQueries({ queryKey: boardKey });
    },
    onSuccess: ({ task }) => {
      patchBoard((board) => ({ ...board, tasks: board.tasks.map((t) => (t.id === task.id ? task : t)) }));
    },
  });

  const updateTask = useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: Record<string, unknown> }) =>
      endpoints.updateTask(taskId, body),
    onSuccess: ({ task }) => {
      patchBoard((board) => ({ ...board, tasks: board.tasks.map((t) => (t.id === task.id ? task : t)) }));
      queryClient.setQueryData(keys.task(task.id), { task });
      if (task.parentTaskId) void queryClient.invalidateQueries({ queryKey: keys.subtasks(task.parentTaskId) });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not save that change');
      void queryClient.invalidateQueries({ queryKey: boardKey });
    },
  });

  const deleteTask = useMutation({
    mutationFn: ({ taskId, strategy }: { taskId: string; strategy: 'REPARENT' | 'CASCADE' }) =>
      endpoints.deleteTask(taskId, strategy),
    onSuccess: (_result, { taskId }) => {
      patchBoard((board) => ({ ...board, tasks: board.tasks.filter((t) => t.id !== taskId) }));
      void queryClient.invalidateQueries({ queryKey: boardKey });
      toast.info('Card deleted');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not delete that card'),
  });

  const createColumn = useMutation({
    mutationFn: ({ name, category }: { name: string; category: string }) =>
      endpoints.createColumn(projectId, { name, category }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: boardKey }),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not add that column'),
  });

  const renameColumn = useMutation({
    mutationFn: ({ columnId, name }: { columnId: string; name: string }) =>
      endpoints.updateColumn(columnId, { name }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: boardKey }),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not rename that column'),
  });

  const deleteColumn = useMutation({
    mutationFn: ({ columnId, moveTo }: { columnId: string; moveTo?: string }) =>
      endpoints.deleteColumn(columnId, moveTo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: boardKey });
      toast.info('Column deleted');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not delete that column'),
  });

  return { createTask, moveTask, updateTask, deleteTask, createColumn, renameColumn, deleteColumn };
};

export const tasksByColumn = (board: BoardSnapshotDto, filtered: TaskDto[]): Record<string, TaskDto[]> => {
  const map: Record<string, TaskDto[]> = {};
  for (const column of board.columns) map[column.id] = [];
  for (const task of filtered) (map[task.columnId] ??= []).push(task);
  for (const list of Object.values(map)) list.sort((a, b) => a.position - b.position);
  return map;
};
