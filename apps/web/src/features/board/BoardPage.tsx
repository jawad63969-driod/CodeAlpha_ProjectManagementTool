import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ActivityDto, BoardColumnDto, UserRefDto } from '@taskforge/shared';
import { endpoints, keys } from '../../shared/api/endpoints.js';
import { ApiError } from '../../shared/api/client.js';
import { useAuth } from '../../shared/auth/AuthContext.jsx';
import { useProjectSubscription } from '../../shared/realtime/SocketContext.jsx';
import { usePresence } from '../../shared/realtime/presenceStore.js';
import { AvatarStack } from '../../shared/ui/Avatar.jsx';
import { ConfirmDialog, Modal } from '../../shared/ui/Modal.jsx';
import { Button, Chip, EmptyState, Field, IconButton, Spinner } from '../../shared/ui/misc.jsx';
import { Icon } from '../../shared/ui/Icon.jsx';
import { relativeTime } from '../../shared/hooks/time.js';
import { tasksByColumn, useBoard, useBoardMutations } from './useBoard.js';
import { activityDay, describeActivity } from './activityText.jsx';
import { KanbanView } from './KanbanView.jsx';
import { ListView } from './ListView.jsx';
import { TaskDrawer } from '../task/TaskDrawer.jsx';

const VIEW_KEY = 'taskforge.view';
const NO_VIEWERS: UserRefDto[] = [];

const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'LOWEST'] as const;

const titleCase = (value: string): string =>
  value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (char) => char.toUpperCase());

export const BoardPage = () => {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: board, isLoading, error } = useBoard(projectId);
  const mutations = useBoardMutations(projectId);
  useProjectSubscription(projectId);

  // A selector must return a stable reference: `?? []` here would build a new
  // array on every render, which makes useSyncExternalStore re-render forever.
  const viewers = usePresence((state) => state.viewers[projectId]) ?? NO_VIEWERS;
  const expireDrags = usePresence((state) => state.expireDrags);
  useEffect(() => {
    const timer = window.setInterval(expireDrags, 1000);
    return () => window.clearInterval(timer);
  }, [expireDrags]);

  const [view, setView] = useState<'KANBAN' | 'LIST'>(
    () => (localStorage.getItem(VIEW_KEY) as 'KANBAN' | 'LIST' | null) ?? 'KANBAN',
  );
  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  const [filters, setFilters] = useState({ q: '', assignee: 'all', priority: 'all' });
  const [showActivity, setShowActivity] = useState(false);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumn, setNewColumn] = useState({ name: '', category: 'TODO' });
  const [deletingColumn, setDeletingColumn] = useState<BoardColumnDto | null>(null);
  const [moveTo, setMoveTo] = useState('');

  const activity = useQuery({
    queryKey: keys.projectActivity(projectId),
    queryFn: () => endpoints.projectActivity(projectId),
    enabled: showActivity,
  });

  const membersById = useMemo(
    () => Object.fromEntries((board?.members ?? []).map((member) => [member.id, member])),
    [board?.members],
  );

  const visibleTasks = useMemo(() => {
    if (!board) return [];
    const needle = filters.q.trim().toLowerCase();
    return board.tasks.filter((task) => {
      if (needle && !`${task.title} ${task.ref} ${task.description}`.toLowerCase().includes(needle)) return false;
      if (filters.assignee === 'me' && task.assigneeId !== session?.user.id) return false;
      if (filters.assignee === 'none' && task.assigneeId) return false;
      if (
        filters.assignee !== 'all' &&
        filters.assignee !== 'me' &&
        filters.assignee !== 'none' &&
        task.assigneeId !== filters.assignee
      )
        return false;
      if (filters.priority !== 'all' && task.priority !== filters.priority) return false;
      return true;
    });
  }, [board, filters, session?.user.id]);

  const byColumn = useMemo(() => (board ? tasksByColumn(board, visibleTasks) : {}), [board, visibleTasks]);

  if (isLoading) return <Spinner full label="Opening the board" />;
  if (error || !board) {
    return (
      <div className="page">
        <div className="page__inner">
          <EmptyState
            icon="lock"
            title={
              error instanceof ApiError && error.status === 403
                ? 'You do not have access to this project'
                : 'Project not found'
            }
            message={error instanceof ApiError ? error.message : undefined}
            action={
              <Button variant="primary" icon="folder" onClick={() => navigate('/')}>
                Back to projects
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const can = (permission: string): boolean => board.permissions.includes(permission);
  const canEdit = can('task.move');
  const canConfigure = can('board.configure');
  const openTaskId = searchParams.get('task');
  const filtersActive = filters.q !== '' || filters.assignee !== 'all' || filters.priority !== 'all';
  const done = board.tasks.filter((task) => task.resolvedAt).length;
  const role = titleCase((board.project.role ?? session?.orgRole ?? '').toString());

  // Group the feed by day so a long list stops being fifteen rows of
  // "16 minutes ago" with nothing separating them.
  const activityGroups: Array<[string, ActivityDto[]]> = [];
  for (const item of activity.data?.data ?? []) {
    const day = activityDay(item.createdAt);
    const last = activityGroups.at(-1);
    if (last && last[0] === day) last[1].push(item);
    else activityGroups.push([day, [item]]);
  }

  return (
    <div className="board-page">
      <header className="board-head">
        <div className="board-head__left">
          <span className="board-head__mark" style={{ background: board.project.color }} aria-hidden="true">
            {board.project.key}
          </span>
          <div className="truncate">
            <h1 className="board-head__title truncate">{board.project.name}</h1>
            <div className="board-head__meta">
              <span>
                {board.tasks.length} card{board.tasks.length === 1 ? '' : 's'}
              </span>
              <span className="faint">·</span>
              <span>{done} done</span>
              <span className="faint">·</span>
              <span>{role}</span>
            </div>
          </div>
        </div>

        <div className="board-head__right">
          {viewers.length > 1 && <AvatarStack people={viewers} />}
          <div className="seg" role="group" aria-label="View mode">
            <button type="button" className={view === 'KANBAN' ? 'is-active' : ''} onClick={() => setView('KANBAN')}>
              <Icon name="board" size={13} />
              Board
            </button>
            <button type="button" className={view === 'LIST' ? 'is-active' : ''} onClick={() => setView('LIST')}>
              <Icon name="list" size={13} />
              List
            </button>
          </div>
          {canConfigure && (
            <IconButton icon="plus" label="Add a column" onClick={() => setAddingColumn(true)} />
          )}
          <Button
            size="sm"
            icon="activity"
            onClick={() => setShowActivity((v) => !v)}
            aria-pressed={showActivity}
          >
            Activity
          </Button>
        </div>
      </header>

      <div className="toolbar">
        <div className="search">
          <span className="search__icon">
            <Icon name="search" size={14} />
          </span>
          <input
            placeholder="Filter cards…"
            value={filters.q}
            aria-label="Filter cards"
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          />
        </div>
        <select
          value={filters.assignee}
          aria-label="Filter by assignee"
          onChange={(e) => setFilters({ ...filters, assignee: e.target.value })}
        >
          <option value="all">Everyone</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
          {board.members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
        <select
          value={filters.priority}
          aria-label="Filter by priority"
          onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
        >
          <option value="all">Any priority</option>
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {titleCase(priority)}
            </option>
          ))}
        </select>
        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            icon="close"
            onClick={() => setFilters({ q: '', assignee: 'all', priority: 'all' })}
          >
            Clear · {visibleTasks.length} of {board.tasks.length}
          </Button>
        )}

        <span className="toolbar__spacer" />

        {!canEdit && (
          <span className="readonly-note">
            <Icon name="lock" size={13} />
            Read-only access
          </span>
        )}
      </div>

      <div className="board-scroll">
        {view === 'KANBAN' ? (
          <KanbanView
            board={board}
            byColumn={byColumn}
            membersById={membersById}
            canEdit={canEdit}
            canConfigure={canConfigure}
            onOpenTask={(taskId) => setSearchParams({ task: taskId })}
            onCreateTask={(columnId, title) => mutations.createTask.mutate({ columnId, title })}
            onRenameColumn={(columnId, name) => mutations.renameColumn.mutate({ columnId, name })}
            onDeleteColumn={(column) => {
              setDeletingColumn(column);
              setMoveTo('');
            }}
            onMove={(taskId, columnId, index) => {
              const task = board.tasks.find((candidate) => candidate.id === taskId);
              if (task) mutations.moveTask.mutate({ taskId, columnId, index, version: task.version });
            }}
          />
        ) : (
          <ListView
            board={board}
            tasks={visibleTasks}
            membersById={membersById}
            onOpenTask={(taskId) => setSearchParams({ task: taskId })}
          />
        )}

        {showActivity && (
          <>
            <div className="rail-scrim" onClick={() => setShowActivity(false)} aria-hidden="true" />
            <aside className="rail" aria-label="Project activity">
              <header className="rail__head">
                <span className="rail__title">Activity</span>
                <IconButton icon="close" label="Close activity" size="sm" onClick={() => setShowActivity(false)} />
              </header>
              <div className="rail__body">
                {activity.isLoading && <Spinner label="Loading activity" />}
                {activityGroups.map(([day, items]) => (
                  // Keyed by the first row, not the day: two runs of the same
                  // day are legitimate if the feed is not strictly ordered.
                  <div key={items[0]!.id}>
                    <div className="rail__day">{day}</div>
                    {items.map((item) => {
                      const line = describeActivity(item, board);
                      return (
                        <div key={item.id} className="activity-row">
                          <span className="activity-row__icon">
                            <Icon name={line.icon} size={13} />
                          </span>
                          <div className="activity-row__body">
                            <p className="activity-row__text">
                              <span className="activity-row__actor">{item.actor?.name ?? 'Someone'}</span> {line.verb}
                              {line.subject && (
                                <>
                                  {' '}
                                  {line.ref && <span className="project-key">{line.ref}</span>}{' '}
                                  <span className="activity-row__subject">{line.subject}</span>
                                </>
                              )}
                              {line.detail && <> {line.detail}</>}
                            </p>
                            <div className="activity-row__time">{relativeTime(item.createdAt)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {!activity.isLoading && activityGroups.length === 0 && (
                  <EmptyState compact icon="activity" title="No activity yet" message="Changes to this board show up here." />
                )}
              </div>
            </aside>
          </>
        )}
      </div>

      {openTaskId && (
        <TaskDrawer
          taskId={openTaskId}
          board={board}
          canEdit={canEdit}
          onClose={() => setSearchParams({})}
          onOpenTask={(taskId) => setSearchParams({ task: taskId })}
        />
      )}

      <Modal open={addingColumn} onClose={() => setAddingColumn(false)} title="Add a column" width={440}>
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (newColumn.name.trim().length < 1) return;
            mutations.createColumn.mutate({ name: newColumn.name.trim(), category: newColumn.category });
            setNewColumn({ name: '', category: 'TODO' });
            setAddingColumn(false);
          }}
        >
          <Field label="Column name" htmlFor="column-name">
            <input
              id="column-name"
              autoFocus
              required
              value={newColumn.name}
              placeholder="Blocked"
              onChange={(e) => setNewColumn({ ...newColumn, name: e.target.value })}
            />
          </Field>
          <Field
            label="Category"
            htmlFor="column-category"
            hint="Cards in a “Done” column count as completed."
          >
            <select
              id="column-category"
              value={newColumn.category}
              onChange={(e) => setNewColumn({ ...newColumn, category: e.target.value })}
            >
              <option value="TODO">To do</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="DONE">Done</option>
            </select>
          </Field>
          <Button type="submit" variant="primary" block icon="plus">
            Add column
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deletingColumn}
        title={`Delete “${deletingColumn?.name}”?`}
        confirmLabel="Delete column"
        busy={mutations.deleteColumn.isPending}
        message={
          <div className="stack">
            <p className="muted">This removes the column from the board. Cards are never deleted with it.</p>
            {(byColumn[deletingColumn?.id ?? ''] ?? []).length > 0 && (
              <Field
                label={`Move its ${byColumn[deletingColumn?.id ?? '']?.length} card(s) to`}
                htmlFor="move-destination"
              >
                <select id="move-destination" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  <option value="">Choose a column…</option>
                  {board.columns
                    .filter((column) => column.id !== deletingColumn?.id)
                    .map((column) => (
                      <option key={column.id} value={column.id}>
                        {column.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
          </div>
        }
        onCancel={() => setDeletingColumn(null)}
        onConfirm={() => {
          if (!deletingColumn) return;
          const occupied = (byColumn[deletingColumn.id] ?? []).length > 0;
          mutations.deleteColumn.mutate(
            occupied ? { columnId: deletingColumn.id, moveTo } : { columnId: deletingColumn.id },
            { onSuccess: () => setDeletingColumn(null) },
          );
        }}
      />

      {board.project.archived && (
        <div className="toasts">
          <Chip icon="archive">This project is archived</Chip>
        </div>
      )}
    </div>
  );
};
