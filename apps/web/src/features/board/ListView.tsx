import type { BoardColumnDto, BoardSnapshotDto, ProjectMemberDto, TaskDto } from '@taskforge/shared';
import { Avatar } from '../../shared/ui/Avatar.jsx';
import { EmptyState, Priority, StatusPill, TypeIcon } from '../../shared/ui/misc.jsx';
import { Icon } from '../../shared/ui/Icon.jsx';
import { dueState } from '../../shared/hooks/time.js';

/**
 * The same data as the Kanban, arranged for scanning rather than for moving.
 * Subtasks are indented under their parent so the hierarchy survives the
 * flattening (FR-E-02).
 *
 * Below a laptop width the table becomes a list of cards. Six fixed columns
 * cannot fit a narrow viewport, and the previous stylesheet had no handling
 * for this at all — the table simply overflowed off-screen.
 */
export const ListView = ({
  board,
  tasks,
  membersById,
  onOpenTask,
}: {
  board: BoardSnapshotDto;
  tasks: TaskDto[];
  membersById: Record<string, ProjectMemberDto>;
  onOpenTask: (taskId: string) => void;
}) => {
  const column = (columnId: string): BoardColumnDto | undefined =>
    board.columns.find((candidate) => candidate.id === columnId);

  const ordered = [...tasks].sort((a, b) => {
    const parentA = a.parentTaskId ?? a.id;
    const parentB = b.parentTaskId ?? b.id;
    if (parentA !== parentB) return parentA.localeCompare(parentB);
    return a.depth - b.depth || a.position - b.position;
  });

  if (ordered.length === 0) {
    return (
      <div className="list-view">
        <EmptyState icon="list" title="No cards match" message="Try clearing the filters above." />
      </div>
    );
  }

  return (
    <div className="list-view">
      <table className="list-table">
        <thead>
          <tr>
            <th style={{ width: '5.5rem' }}>Key</th>
            <th>Title</th>
            <th style={{ width: '9rem' }}>Status</th>
            <th style={{ width: '7rem' }}>Priority</th>
            <th style={{ width: '7rem' }}>Due</th>
            <th style={{ width: '4rem' }}>Assignee</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((task) => {
            const due = dueState(task.dueDate);
            const status = column(task.columnId);
            return (
              <tr
                key={task.id}
                className={task.resolvedAt ? 'is-done' : ''}
                onClick={() => onOpenTask(task.id)}
                tabIndex={0}
                onKeyDown={(event) => event.key === 'Enter' && onOpenTask(task.id)}
              >
                <td>
                  <span className="task-card__ref">{task.ref}</span>
                </td>
                <td>
                  <span className="list-table__title">
                    {task.depth > 0 && (
                      <span className="list-indent" style={{ width: `${task.depth * 1.25}rem` }} aria-hidden="true" />
                    )}
                    <TypeIcon type={task.type} />
                    <span>{task.title}</span>
                    {task.subtaskCount > 0 && (
                      <span className="list-table__sub">
                        {task.subtaskDoneCount}/{task.subtaskCount}
                      </span>
                    )}
                  </span>
                </td>
                <td>
                  <StatusPill name={status?.name ?? '—'} category={status?.category} />
                </td>
                <td>
                  <Priority priority={task.priority} withLabel />
                </td>
                <td>
                  {due ? (
                    <span className={`due due--${due.tone}`}>
                      <Icon name="calendar" size={12} />
                      {due.label}
                    </span>
                  ) : (
                    <span className="faint small">—</span>
                  )}
                </td>
                <td>
                  <Avatar person={task.assigneeId ? membersById[task.assigneeId] : undefined} size={22} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="list-cards">
        {ordered.map((task) => {
          const due = dueState(task.dueDate);
          const status = column(task.columnId);
          return (
            <button key={task.id} type="button" className="list-card" onClick={() => onOpenTask(task.id)}>
              <span className="list-card__head">
                <TypeIcon type={task.type} />
                <span className="task-card__ref">{task.ref}</span>
                <Priority priority={task.priority} />
                <span className="grow" />
                <Avatar person={task.assigneeId ? membersById[task.assigneeId] : undefined} size={20} />
              </span>
              <span className="task-card__title">{task.title}</span>
              <span className="list-card__foot">
                <StatusPill name={status?.name ?? '—'} category={status?.category} />
                {due && (
                  <span className={`due due--${due.tone}`}>
                    <Icon name="calendar" size={12} />
                    {due.label}
                  </span>
                )}
                {task.subtaskCount > 0 && (
                  <span className="task-card__stat">
                    <Icon name="checkSquare" size={12} />
                    {task.subtaskDoneCount}/{task.subtaskCount}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
