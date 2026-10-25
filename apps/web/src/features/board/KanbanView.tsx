import { useMemo, useState, type FormEvent } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners,
  useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { BoardColumnDto, BoardSnapshotDto, ProjectMemberDto, TaskDto } from '@taskforge/shared';
import { TaskCard } from './TaskCard.jsx';
import { useSocket } from '../../shared/realtime/SocketContext.jsx';
import { Button, IconButton } from '../../shared/ui/misc.jsx';
import { Icon } from '../../shared/ui/Icon.jsx';

interface Props {
  board: BoardSnapshotDto;
  byColumn: Record<string, TaskDto[]>;
  membersById: Record<string, ProjectMemberDto>;
  canEdit: boolean;
  canConfigure: boolean;
  onOpenTask: (taskId: string) => void;
  onCreateTask: (columnId: string, title: string) => void;
  onRenameColumn: (columnId: string, name: string) => void;
  onDeleteColumn: (column: BoardColumnDto) => void;
  onMove: (taskId: string, columnId: string, index: number) => void;
}

const Column = ({
  column, tasks, membersById, canEdit, canConfigure, onOpenTask, onCreateTask, onRenameColumn, onDeleteColumn,
}: Omit<Props, 'board' | 'byColumn' | 'onMove'> & { column: BoardColumnDto; tasks: TaskDto[] }) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { type: 'column', columnId: column.id } });
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(column.name);

  const submitCard = (event: FormEvent): void => {
    event.preventDefault();
    const title = draft.trim();
    if (title.length < 2) return;
    onCreateTask(column.id, title);
    setDraft('');
  };

  return (
    <section className={`column${isOver ? ' is-over' : ''}`} aria-label={column.name}>
      <header className="column__head">
        <span className={`column__dot column__dot--${column.category.toLowerCase()}`} aria-hidden="true" />
        {renaming ? (
          <form
            className="grow"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim() && name.trim() !== column.name) onRenameColumn(column.id, name.trim());
              setRenaming(false);
            }}
          >
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
                   onBlur={() => setRenaming(false)} aria-label="Column name" />
          </form>
        ) : (
          <button type="button" className="column__title" onClick={() => canConfigure && setRenaming(true)}
                  title={canConfigure ? 'Rename column' : undefined}>
            {column.name}
          </button>
        )}
        <span className="column__count">{tasks.length}</span>
        {canConfigure && (
          // The delete control used to be a bare ✕ sitting permanently in the
          // header — a destructive action one misclick away. It now appears on
          // hover or focus only, and still routes through a confirm dialog.
          <span className="column__actions">
            <IconButton icon="settings" label={`Rename ${column.name}`} size="sm" onClick={() => setRenaming(true)} />
            <IconButton
              icon="trash"
              label={`Delete ${column.name}`}
              size="sm"
              tone="danger"
              onClick={() => onDeleteColumn(column)}
            />
          </span>
        )}
      </header>

      <div className="column__body" ref={setNodeRef} data-column-id={column.id}>
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              assignee={task.assigneeId ? membersById[task.assigneeId] : undefined}
              onOpen={() => onOpenTask(task.id)}
              sortable={canEdit}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && <p className="column__empty">Nothing here yet</p>}
      </div>

      {canEdit && (composing ? (
        <form className="column__composer" onSubmit={submitCard}>
          <textarea
            autoFocus rows={2} value={draft} placeholder="What needs doing?"
            aria-label={`New card in ${column.name}`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitCard(event); }
              if (event.key === 'Escape') { setComposing(false); setDraft(''); }
            }}
          />
          <div className="column__composer-actions">
            <Button type="submit" variant="primary" size="sm">Add card</Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setComposing(false); setDraft(''); }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <button type="button" className="column__add" onClick={() => setComposing(true)}>
          <Icon name="plus" size={13} />
          Add a card
        </button>
      ))}
    </section>
  );
};

export const KanbanView = (props: Props) => {
  const { board, byColumn, canEdit, onMove } = props;
  const [dragging, setDragging] = useState<TaskDto | null>(null);
  const { reportDrag } = useSocket();

  // A keyboard sensor sits alongside the pointer sensor, so every drag has a
  // keyboard equivalent (FR-E-06, NFR-16).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columns = useMemo(() => [...board.columns].sort((a, b) => a.position - b.position), [board.columns]);

  const onDragStart = (event: DragStartEvent): void => {
    const task = event.active.data.current?.['task'] as TaskDto | undefined;
    if (!task) return;
    setDragging(task);
    reportDrag(board.project.id, task.id, task.columnId);
  };

  const onDragEnd = (event: DragEndEvent): void => {
    setDragging(null);
    const { active, over } = event;
    if (!over) return;

    const task = active.data.current?.['task'] as TaskDto | undefined;
    if (!task) return;

    // The drop target is either a column (empty space) or another card.
    const overData = over.data.current as { type?: string; columnId?: string; task?: TaskDto } | undefined;
    const targetColumnId = overData?.type === 'column'
      ? (overData.columnId as string)
      : overData?.task?.columnId ?? task.columnId;

    const destination = (byColumn[targetColumnId] ?? []).filter((t) => t.id !== task.id);
    const index = overData?.type === 'task'
      ? Math.max(0, destination.findIndex((t) => t.id === over.id))
      : destination.length;

    const currentIndex = (byColumn[task.columnId] ?? []).findIndex((t) => t.id === task.id);
    if (targetColumnId === task.columnId && index === currentIndex) return;

    onMove(task.id, targetColumnId, index);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="board">
        {columns.map((column) => (
          <Column key={column.id} {...props} column={column} tasks={byColumn[column.id] ?? []} />
        ))}
      </div>

      <DragOverlay>
        {dragging && (
          <div className="task-card__ghost" style={{ width: 'var(--column-w)' }}>
            <TaskCard task={dragging} onOpen={() => undefined} sortable={false}
                      assignee={dragging.assigneeId ? props.membersById[dragging.assigneeId] : undefined} />
          </div>
        )}
      </DragOverlay>
      {!canEdit && <span className="sr-only">Read-only access — dragging is disabled.</span>}
    </DndContext>
  );
};
