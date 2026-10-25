import type {
  ActivityDto, BoardColumnDto, CommentDto, NotificationDto, ProjectDto,
  ProjectMemberDto, TaskDto, UserRefDto,
} from './dto.js';

/**
 * The real-time contract. Because the server emits `ServerEvents[K]` and the
 * client handles `ServerEvents[K]`, an event whose payload changes shape is a
 * compile error on both sides rather than a runtime surprise on one.
 */
export interface ServerEventPayloads {
  'task.created': { task: TaskDto };
  'task.updated': { task: TaskDto };
  'task.moved': { task: TaskDto; fromColumnId: string; toColumnId: string };
  'task.deleted': { taskId: string; columnId: string; reparentedTo: string | null };

  'column.created': { column: BoardColumnDto };
  'column.updated': { column: BoardColumnDto };
  'column.deleted': { columnId: string; movedTasksTo: string | null };
  'column.reordered': { columns: BoardColumnDto[] };

  'comment.created': { comment: CommentDto; taskId: string };
  'comment.updated': { comment: CommentDto; taskId: string };
  'comment.deleted': { commentId: string; taskId: string };

  'project.updated': { project: ProjectDto };
  'project.deleted': { projectId: string };
  'member.added': { member: ProjectMemberDto };
  'member.updated': { userId: string; role: string };
  'member.removed': { userId: string };

  'activity.created': { activity: ActivityDto };
  'notification.created': { notification: NotificationDto };

  'presence.updated': { projectId: string; viewers: UserRefDto[] };
  'task.dragging': { taskId: string; columnId: string; user: UserRefDto };
}

export type ServerEventName = keyof ServerEventPayloads;

/**
 * Every event travels inside this envelope — ARCHITECTURE §7.2.
 *
 * Written as a mapped-then-indexed type rather than a generic interface so that
 * `EventEnvelope` (with no argument) is a genuine DISCRIMINATED union: switching
 * on `event.type` narrows `event.payload` to exactly that event's shape. An
 * interface with a defaulted parameter would widen `payload` to the union of
 * every payload, and the narrowing a consumer needs would be lost.
 */
export type EventEnvelope<K extends ServerEventName = ServerEventName> = {
  [T in K]: {
    type: T;
    /** Envelope version, so a future shape change can be detected by old clients. */
    version: 1;
    /** Who caused it. Clients discard events they caused themselves. */
    actorId: string;
    organizationId: string;
    projectId: string | null;
    occurredAt: string;
    payload: ServerEventPayloads[T];
  };
}[K];

/** Messages the client may send. Kept deliberately small — writes go over REST. */
export interface ClientEventPayloads {
  'project.subscribe': { projectId: string };
  'project.unsubscribe': { projectId: string };
  'task.dragging': { projectId: string; taskId: string; columnId: string };
}

export type ClientEventName = keyof ClientEventPayloads;

export interface SubscribeAck {
  ok: boolean;
  error?: string;
  viewers?: UserRefDto[];
}

export const room = {
  user: (userId: string) => `user:${userId}`,
  org: (organizationId: string) => `org:${organizationId}`,
  project: (projectId: string) => `project:${projectId}`,
} as const;
