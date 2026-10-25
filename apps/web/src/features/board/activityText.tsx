import type { ActivityDto, BoardSnapshotDto } from '@taskforge/shared';
import type { IconName } from '../../shared/ui/Icon.jsx';

/**
 * Turns an audit row into a sentence that names what it happened to.
 *
 * Every entry in the activity rail used to read "Ayesha Siddiqui created" —
 * actor and verb, no object at all. The audit trail is one of this product's
 * headline features and it was telling the reader nothing.
 *
 * The subject is resolved from the board snapshot the page already holds, so
 * this costs no extra request. When a card has since been deleted it is not in
 * the snapshot any more, and the title recorded in the audit row itself is used
 * instead — which is exactly why the trail stores it.
 */
export interface ActivityLine {
  icon: IconName;
  verb: string;
  subject: string | null;
  ref: string | null;
  detail: string | null;
}

const VERBS: Record<string, { verb: string; icon: IconName }> = {
  created: { verb: 'created', icon: 'plus' },
  updated: { verb: 'updated', icon: 'settings' },
  assigned: { verb: 'assigned', icon: 'users' },
  moved: { verb: 'moved', icon: 'board' },
  deleted: { verb: 'deleted', icon: 'trash' },
  reparented: { verb: 're-parented', icon: 'subtask' },
  commented: { verb: 'commented on', icon: 'message' },
  attached: { verb: 'attached a file to', icon: 'paperclip' },
};

const recordedTitle = (activity: ActivityDto): string | null => {
  const title = activity.changes['title'];
  if (!title) return null;
  return (title.to ?? title.from) as string | null;
};

export const describeActivity = (activity: ActivityDto, board: BoardSnapshotDto): ActivityLine => {
  const known = VERBS[activity.action] ?? { verb: activity.action.replace(/_/g, ' '), icon: 'activity' as IconName };

  // A comment's audit row carries the task it belongs to, so the feed can name
  // the card rather than an opaque comment id.
  const taskId =
    activity.entityType === 'COMMENT'
      ? ((activity.changes['taskId']?.to as string | undefined) ?? null)
      : activity.entityId;

  const task = taskId ? board.tasks.find((candidate) => candidate.id === taskId) : undefined;
  const subject = task?.title ?? recordedTitle(activity);
  const ref = task?.ref ?? null;

  let detail: string | null = null;
  if (activity.action === 'moved') {
    const to = activity.changes['columnId']?.to as string | undefined;
    const column = board.columns.find((candidate) => candidate.id === to);
    detail = column ? `to ${column.name}` : null;
  } else if (activity.action === 'assigned') {
    const to = activity.changes['assigneeId']?.to as string | undefined;
    const member = board.members.find((candidate) => candidate.id === to);
    detail = member ? `to ${member.name}` : 'to nobody';
  } else if (activity.action === 'updated') {
    const fields = Object.keys(activity.changes).filter((field) => field !== 'version');
    if (fields.length > 0) {
      detail = `— ${fields.slice(0, 2).join(', ')}${fields.length > 2 ? ` +${fields.length - 2} more` : ''}`;
    }
  }

  return {
    icon: known.icon,
    verb: known.verb,
    subject: subject ?? (activity.entityType === 'COMMENT' ? 'a card' : null),
    ref,
    detail,
  };
};

/** Groups rows under Today / Yesterday / a date, so long feeds stay readable. */
export const activityDay = (iso: string): string => {
  const date = new Date(iso);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayMs = 86_400_000;

  if (startOfDate === startOfToday) return 'Today';
  if (startOfDate === startOfToday - dayMs) return 'Yesterday';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
