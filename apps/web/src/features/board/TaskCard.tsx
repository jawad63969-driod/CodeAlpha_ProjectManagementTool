import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ProjectMemberDto, TaskDto } from '@taskforge/shared';
import { Avatar } from '../../shared/ui/Avatar.jsx';
import { LabelPill, Priority, TypeIcon } from '../../shared/ui/misc.jsx';
import { Icon } from '../../shared/ui/Icon.jsx';
import { dueState } from '../../shared/hooks/time.js';
import { usePresence } from '../../shared/realtime/presenceStore.js';

interface Props {
  task: TaskDto;
  assignee?: ProjectMemberDto | undefined;
  onOpen: () => void;
  sortable: boolean;
}

/**
 * Card layout, top to bottom: identity, then the thing itself, then its
 * context. The old card led with a row of loud label pills, which pushed the
 * title down and made every card a different height depending on whether it
 * happened to be labelled.
 */
export const TaskCard = ({ task, assignee, onOpen, sortable }: Props) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !sortable,
    data: { type: 'task', task },
  });
  const remoteDrag = usePresence((state) => state.drags[task.id]);
  const due = dueState(task.dueDate);
  const hasStats = task.subtaskCount > 0 || task.commentCount > 0 || task.attachmentCount > 0 || Boolean(due);

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`task-card${isDragging ? ' is-dragging' : ''}${task.resolvedAt ? ' is-done' : ''}`}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      onKeyDown={(event) => {
        // Enter opens the card; Space belongs to the drag sensor.
        //
        // This handler is declared after {...listeners}, so it REPLACES the
        // onKeyDown that dnd-kit's KeyboardSensor registers as its activator.
        // Forwarding to it is what makes keyboard dragging work at all — without
        // this line the card still announces itself as draggable to a screen
        // reader and nothing happens when you press Space.
        if (event.key === 'Enter') {
          event.preventDefault();
          onOpen();
          return;
        }
        listeners?.onKeyDown?.(event);
      }}
      role="button"
      tabIndex={0}
      aria-label={`${task.ref} ${task.title}`}
      data-testid="task-card"
      data-task-id={task.id}
    >
      <div className="task-card__top">
        <TypeIcon type={task.type} />
        <span className="task-card__ref">{task.ref}</span>
        <Priority priority={task.priority} />
        <span className="task-card__spacer" />
        {remoteDrag ? (
          <span className="chip chip--accent">{remoteDrag.user.name.split(' ')[0]} is moving this</span>
        ) : (
          <Avatar person={assignee} size={20} />
        )}
      </div>

      <p className="task-card__title">{task.title}</p>

      {task.labels.length > 0 && (
        <div className="task-card__labels">
          {task.labels.map((label) => (
            <LabelPill key={label.id} name={label.name} />
          ))}
        </div>
      )}

      {hasStats && (
        <div className="task-card__meta">
          {task.subtaskCount > 0 && (
            <span className="task-card__stat" title={`${task.subtaskDoneCount} of ${task.subtaskCount} subtasks done`}>
              <Icon name="checkSquare" size={12} />
              {task.subtaskDoneCount}/{task.subtaskCount}
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="task-card__stat" title={`${task.commentCount} comments`}>
              <Icon name="message" size={12} />
              {task.commentCount}
            </span>
          )}
          {task.attachmentCount > 0 && (
            <span className="task-card__stat" title={`${task.attachmentCount} attachments`}>
              <Icon name="paperclip" size={12} />
              {task.attachmentCount}
            </span>
          )}
          {due && (
            <span className={`due due--${due.tone}`}>
              <Icon name="calendar" size={12} />
              {due.label}
            </span>
          )}
        </div>
      )}
    </article>
  );
};
