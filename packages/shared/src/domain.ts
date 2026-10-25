/** Domain enumerations shared by the database schema, the API and the client. */

export const TaskType = {
  EPIC: 'EPIC',
  STORY: 'STORY',
  TASK: 'TASK',
  BUG: 'BUG',
  SUBTASK: 'SUBTASK',
} as const;
export type TaskType = (typeof TaskType)[keyof typeof TaskType];
export const TASK_TYPES = Object.values(TaskType);

export const TaskPriority = {
  LOWEST: 'LOWEST',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];
export const TASK_PRIORITIES = Object.values(TaskPriority);

/** Sort weight for "most urgent first" ordering. Lower is more urgent. */
export const PRIORITY_RANK: Record<TaskPriority, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, LOWEST: 4,
};

export const StatusCategory = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
} as const;
export type StatusCategory = (typeof StatusCategory)[keyof typeof StatusCategory];
export const STATUS_CATEGORIES = Object.values(StatusCategory);

export const BoardViewMode = { KANBAN: 'KANBAN', LIST: 'LIST' } as const;
export type BoardViewMode = (typeof BoardViewMode)[keyof typeof BoardViewMode];

export const EntityType = {
  PROJECT: 'PROJECT',
  BOARD: 'BOARD',
  COLUMN: 'COLUMN',
  TASK: 'TASK',
  COMMENT: 'COMMENT',
  ATTACHMENT: 'ATTACHMENT',
  MEMBER: 'MEMBER',
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];

export const NotificationType = {
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_MOVED: 'TASK_MOVED',
  COMMENT_CREATED: 'COMMENT_CREATED',
  MENTIONED: 'MENTIONED',
  PROJECT_INVITED: 'PROJECT_INVITED',
  DUE_SOON: 'DUE_SOON',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

/** Hierarchy depth cap — FR-F-05. Root is depth 0, so 5 levels means max index 4. */
export const MAX_TASK_DEPTH = 4;

/** The four statuses every project is provisioned with — FR-D-02. */
export const DEFAULT_WORKFLOW: ReadonlyArray<{
  name: string;
  category: StatusCategory;
  isInitial: boolean;
}> = [
  { name: 'Backlog', category: StatusCategory.TODO, isInitial: true },
  { name: 'In Progress', category: StatusCategory.IN_PROGRESS, isInitial: false },
  { name: 'Code Review', category: StatusCategory.IN_PROGRESS, isInitial: false },
  { name: 'Done', category: StatusCategory.DONE, isInitial: false },
];
