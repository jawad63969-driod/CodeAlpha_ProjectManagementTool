import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BoardSnapshotDto, TaskDto } from '@taskforge/shared';
import { endpoints, keys } from '../../shared/api/endpoints.js';
import { ApiError } from '../../shared/api/client.js';
import { Avatar } from '../../shared/ui/Avatar.jsx';
import { ConfirmDialog } from '../../shared/ui/Modal.jsx';
import { useToast } from '../../shared/ui/Toast.jsx';
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Section,
  Spinner,
  Tabs,
  TypeIcon,
  typeLabel,
} from '../../shared/ui/misc.jsx';
import { Icon } from '../../shared/ui/Icon.jsx';
import { formatDate, relativeTime } from '../../shared/hooks/time.js';
import { useBoardMutations } from '../board/useBoard.js';
import { CommentThread } from '../comments/CommentThread.jsx';
import { AttachmentsPanel } from './AttachmentsPanel.jsx';

const PRIORITIES = ['LOWEST', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const TYPES = ['EPIC', 'STORY', 'TASK', 'BUG', 'SUBTASK'] as const;
type Tab = 'details' | 'subtasks' | 'files' | 'activity';

/** Enum values are a storage detail. The interface shows words. */
const titleCase = (value: string): string =>
  value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (char) => char.toUpperCase());

const FIELD_LABELS: Record<string, string> = {
  assigneeId: 'assignee',
  columnId: 'status',
  dueDate: 'due date',
  storyPoints: 'story points',
  parentTaskId: 'parent',
  labelIds: 'labels',
};

export const TaskDrawer = ({
  taskId,
  board,
  canEdit,
  onClose,
  onOpenTask,
}: {
  taskId: string;
  board: BoardSnapshotDto;
  canEdit: boolean;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const mutations = useBoardMutations(board.project.id);
  const [tab, setTab] = useState<Tab>('details');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: keys.task(taskId),
    queryFn: () => endpoints.task(taskId),
    initialData: () => {
      const cached = board.tasks.find((task) => task.id === taskId);
      return cached ? { task: cached } : undefined;
    },
  });

  const subtasks = useQuery({
    queryKey: keys.subtasks(taskId),
    queryFn: () => endpoints.subtasks(taskId),
    enabled: tab === 'subtasks',
  });

  const activity = useQuery({
    queryKey: keys.taskActivity(taskId),
    queryFn: () => endpoints.taskActivity(taskId),
    enabled: tab === 'activity',
  });

  const task: TaskDto | undefined = data?.task;
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description);
  }, [task?.id, task?.title, task?.description]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const addSubtask = useMutation({
    mutationFn: (subtaskTitle: string) =>
      endpoints.createTask(board.project.id, { title: subtaskTitle, parentTaskId: taskId }),
    onSuccess: () => {
      setSubtaskDraft('');
      void queryClient.invalidateQueries({ queryKey: keys.subtasks(taskId) });
      void queryClient.invalidateQueries({ queryKey: keys.task(taskId) });
      void queryClient.invalidateQueries({ queryKey: keys.board(board.project.id) });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not add that subtask'),
  });

  if (isLoading) {
    return (
      <div className="drawer-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <aside className="drawer">
          <Spinner full label="Loading card" />
        </aside>
      </div>
    );
  }

  // A failed fetch used to fall into the `!task` branch above and spin forever:
  // 4xx responses are not retried, so nothing ever resolved it and Escape was
  // the only way out — with nothing on screen saying so.
  if (error || !task) {
    const status = error instanceof ApiError ? error.status : 0;
    return (
      <div className="drawer-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <aside className="drawer" role="dialog" aria-modal="true" aria-label="Card unavailable">
          <header className="drawer__head">
            <span className="drawer__crumb">Card unavailable</span>
            <span className="drawer__head-actions">
              <IconButton icon="close" label="Close" onClick={onClose} />
            </span>
          </header>
          <div className="drawer__body">
            <EmptyState
              icon={status === 403 ? 'lock' : 'alert'}
              title={
                status === 403
                  ? 'You do not have access to this card'
                  : status === 404
                    ? 'This card no longer exists'
                    : 'That card could not be loaded'
              }
              message={error instanceof ApiError ? error.message : undefined}
              action={
                <Button variant="primary" onClick={onClose}>
                  Back to the board
                </Button>
              }
            />
          </div>
        </aside>
      </div>
    );
  }

  const save = (body: Record<string, unknown>): void => {
    mutations.updateTask.mutate({ taskId, body: { ...body, version: task.version } });
  };

  const column = board.columns.find((candidate) => candidate.id === task.columnId);
  const reporter = board.members.find((member) => member.id === task.reporterId);
  const parent = task.parentTaskId ? board.tasks.find((candidate) => candidate.id === task.parentTaskId) : undefined;
  const progress = task.subtaskCount > 0 ? Math.round((task.subtaskDoneCount / task.subtaskCount) * 100) : 0;

  return (
    <>
      <div className="drawer-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <aside className="drawer" role="dialog" aria-modal="true" aria-label={`${task.ref} ${task.title}`}>
          <header className="drawer__head">
            <span className="drawer__crumb truncate">
              <TypeIcon type={task.type} />
              <span className="task-card__ref">{task.ref}</span>
              <span className="faint">in</span>
              <span className="truncate">{column?.name}</span>
              {parent && (
                <>
                  <span className="faint">·</span>
                  <button type="button" className="link-btn" onClick={() => onOpenTask(parent.id)}>
                    {parent.ref}
                  </button>
                </>
              )}
            </span>

            <span className="drawer__head-actions">
              {mutations.updateTask.isPending && <span className="faint small">Saving…</span>}
              {canEdit && (
                <IconButton icon="trash" label="Delete card" tone="danger" onClick={() => setConfirmDelete(true)} />
              )}
              <IconButton icon="close" label="Close card" onClick={onClose} />
            </span>
          </header>

          <div className="drawer__body">
            <input
              className="drawer__title"
              value={title}
              disabled={!canEdit}
              aria-label="Card title"
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => title.trim() !== task.title && title.trim().length >= 2 && save({ title: title.trim() })}
            />

            <div className="drawer__grid">
              <Field label="Status" htmlFor="task-status">
                <select
                  id="task-status"
                  value={task.columnId}
                  disabled={!canEdit}
                  onChange={(event) =>
                    mutations.moveTask.mutate({
                      taskId,
                      columnId: event.target.value,
                      index: 0,
                      version: task.version,
                    })
                  }
                >
                  {board.columns.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Assignee" htmlFor="task-assignee">
                <select
                  id="task-assignee"
                  value={task.assigneeId ?? ''}
                  disabled={!canEdit}
                  onChange={(event) => save({ assigneeId: event.target.value || null })}
                >
                  <option value="">Unassigned</option>
                  {board.members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Priority" htmlFor="task-priority">
                <select
                  id="task-priority"
                  value={task.priority}
                  disabled={!canEdit}
                  onChange={(event) => save({ priority: event.target.value })}
                >
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {titleCase(priority)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Type" htmlFor="task-type">
                <select
                  id="task-type"
                  value={task.type}
                  disabled={!canEdit}
                  onChange={(event) => save({ type: event.target.value })}
                >
                  {TYPES.map((type) => (
                    <option key={type} value={type}>
                      {typeLabel(type)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Due date" htmlFor="task-due">
                <span className="date-field">
                  <input
                    id="task-due"
                    type="date"
                    value={task.dueDate ?? ''}
                    disabled={!canEdit}
                    data-empty={task.dueDate ? 'false' : 'true'}
                    onChange={(event) => save({ dueDate: event.target.value || null })}
                  />
                  {!task.dueDate && <span className="date-field__placeholder">No due date</span>}
                </span>
              </Field>

              <Field label="Story points" htmlFor="task-points">
                <input
                  id="task-points"
                  type="number"
                  min={0}
                  max={999}
                  placeholder="—"
                  value={task.storyPoints ?? ''}
                  disabled={!canEdit}
                  onChange={(event) =>
                    save({ storyPoints: event.target.value === '' ? null : Number(event.target.value) })
                  }
                />
              </Field>
            </div>

            <div style={{ marginTop: 'var(--sp-6)' }} className="stack">
              {board.labels.length > 0 && (
                <Field label="Labels" hint={canEdit ? 'Click to apply or remove.' : undefined}>
                  <div className="labels-editor">
                    {board.labels.map((label) => {
                      const on = task.labels.some((applied) => applied.id === label.id);
                      return (
                        <button
                          key={label.id}
                          type="button"
                          disabled={!canEdit}
                          aria-pressed={on}
                          className={`labels-editor__toggle${on ? ' is-on' : ''}`}
                          onClick={() =>
                            save({
                              labelIds: on
                                ? task.labels.filter((applied) => applied.id !== label.id).map((applied) => applied.id)
                                : [...task.labels.map((applied) => applied.id), label.id],
                            })
                          }
                        >
                          <span
                            style={{
                              width: 'var(--sp-3)',
                              height: 'var(--sp-3)',
                              borderRadius: 'var(--r-full)',
                              background: label.color,
                            }}
                            aria-hidden="true"
                          />
                          {label.name}
                          {on && <Icon name="check" size={11} />}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              )}

              <Field label="Description" htmlFor="task-description">
                <textarea
                  id="task-description"
                  rows={3}
                  value={description}
                  disabled={!canEdit}
                  placeholder="Context, acceptance criteria, links…"
                  onChange={(event) => setDescription(event.target.value)}
                  onBlur={() => description !== task.description && save({ description })}
                />
              </Field>
            </div>

            <div className="drawer__reporter">
              <Avatar person={reporter} size={20} />
              <span>
                Reported by {reporter?.name ?? 'someone'} · {formatDate(task.createdAt)}
                {task.resolvedAt && ` · resolved ${relativeTime(task.resolvedAt)}`}
              </span>
            </div>

            <div className="drawer__tabs">
              <Tabs<Tab>
                active={tab}
                onChange={setTab}
                tabs={[
                  { id: 'details', label: 'Discussion', count: task.commentCount || '' },
                  {
                    id: 'subtasks',
                    label: 'Subtasks',
                    count: task.subtaskCount ? `${task.subtaskDoneCount}/${task.subtaskCount}` : '',
                  },
                  { id: 'files', label: 'Files', count: task.attachmentCount || '' },
                  { id: 'activity', label: 'History' },
                ]}
              />
            </div>

            <div className="tab-panel">
              {tab === 'details' && <CommentThread taskId={taskId} members={board.members} canComment={canEdit} />}

              {tab === 'subtasks' && (
                <div className="stack">
                  {task.subtaskCount > 0 && (
                    <div className="progress">
                      <div className="progress__track">
                        <div className="progress__fill" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="progress-note">
                        {task.subtaskDoneCount} of {task.subtaskCount} done
                      </span>
                    </div>
                  )}
                  {subtasks.isLoading && <Spinner label="Loading subtasks" />}
                  {(subtasks.data?.tasks ?? []).map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      className={`subtask-row${child.resolvedAt ? ' is-done' : ''}`}
                      onClick={() => onOpenTask(child.id)}
                    >
                      <TypeIcon type={child.type} />
                      <span className="task-card__ref">{child.ref}</span>
                      <span className="subtask-row__title truncate">{child.title}</span>
                      <Avatar person={board.members.find((member) => member.id === child.assigneeId)} size={20} />
                    </button>
                  ))}
                  {(subtasks.data?.tasks ?? []).length === 0 && !subtasks.isLoading && (
                    <EmptyState
                      compact
                      icon="subtask"
                      title="No subtasks yet"
                      message={canEdit ? 'Break this card down below.' : undefined}
                    />
                  )}
                  {canEdit && task.depth < 4 && (
                    <form
                      className="row"
                      onSubmit={(event: FormEvent) => {
                        event.preventDefault();
                        if (subtaskDraft.trim().length >= 2) addSubtask.mutate(subtaskDraft.trim());
                      }}
                    >
                      <input
                        className="grow"
                        value={subtaskDraft}
                        placeholder="Add a subtask…"
                        aria-label="New subtask"
                        onChange={(event) => setSubtaskDraft(event.target.value)}
                      />
                      <Button type="submit" icon="plus" loading={addSubtask.isPending}>
                        Add
                      </Button>
                    </form>
                  )}
                  {task.depth >= 4 && (
                    <p className="faint small">This card is at the maximum nesting depth of five levels.</p>
                  )}
                </div>
              )}

              {tab === 'files' && <AttachmentsPanel taskId={taskId} canEdit={canEdit} />}

              {tab === 'activity' && (
                <div>
                  {activity.isLoading && <Spinner label="Loading history" />}
                  {(activity.data?.data ?? []).map((entry) => (
                    <div key={entry.id} className="history-row">
                      <Avatar person={entry.actor ?? undefined} size={22} />
                      <div className="grow">
                        <div>
                          <strong>{entry.actor?.name ?? 'Someone'}</strong> {entry.action.replace(/_/g, ' ')}
                        </div>
                        {Object.entries(entry.changes)
                          .filter(([field]) => field !== 'version')
                          .slice(0, 3)
                          .map(([field, change]) => (
                            <div key={field} className="history-row__change">
                              <span>{FIELD_LABELS[field] ?? field}</span>
                              <span className="history-row__value">{String(change.from ?? '—')}</span>
                              <Icon name="chevronRight" size={11} />
                              <span className="history-row__value">{String(change.to ?? '—')}</span>
                            </div>
                          ))}
                        <div className="activity-row__time">{relativeTime(entry.createdAt)}</div>
                      </div>
                    </div>
                  ))}
                  {!activity.isLoading && (activity.data?.data ?? []).length === 0 && (
                    <EmptyState compact icon="activity" title="No history yet" />
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this card?"
        confirmLabel={task.subtaskCount > 0 ? 'Delete and keep subtasks' : 'Delete'}
        busy={mutations.deleteTask.isPending}
        message={
          task.subtaskCount > 0 ? (
            <>
              Its {task.subtaskCount} subtask(s) will be moved up to {parent ? parent.ref : 'the top level'} rather than
              deleted.
            </>
          ) : (
            <>This removes the card and its comments permanently.</>
          )
        }
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          mutations.deleteTask.mutate(
            { taskId, strategy: 'REPARENT' },
            {
              onSuccess: () => {
                setConfirmDelete(false);
                onClose();
              },
            },
          )
        }
      />
    </>
  );
};
