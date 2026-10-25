import type { BoardViewMode, EntityType, NotificationType, StatusCategory, TaskPriority, TaskType } from './domain.js';
import type { OrgRole, ProjectRole } from './rbac/roles.js';

/** Response shapes. The API returns exactly these; the client imports them. */

export interface UserDto {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  avatarColor: string;
  timezone: string;
}

/** The compact form embedded in tasks, comments and activity rows. */
export interface UserRefDto {
  id: string;
  name: string;
  avatarColor: string;
}

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
}

export interface OrgMemberDto extends UserDto {
  role: OrgRole;
  status: 'ACTIVE' | 'SUSPENDED';
  joinedAt: string;
}

export interface SessionDto {
  user: UserDto;
  organization: OrganizationDto;
  orgRole: OrgRole;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ProjectDto {
  id: string;
  organizationId: string;
  key: string;
  name: string;
  description: string;
  color: string;
  leadId: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  /** Present on list endpoints. */
  memberCount?: number;
  taskCount?: number;
  doneCount?: number;
  /** The caller's role in this project, null when they reach it via an org grant. */
  role?: ProjectRole | null;
}

export interface ProjectMemberDto extends UserRefDto {
  email: string;
  jobTitle: string | null;
  role: ProjectRole;
  joinedAt: string;
}

export interface WorkflowStatusDto {
  id: string;
  name: string;
  category: StatusCategory;
  position: number;
  isInitial: boolean;
}

export interface BoardColumnDto {
  id: string;
  boardId: string;
  statusId: string;
  name: string;
  position: number;
  wipLimit: number | null;
  category: StatusCategory;
}

export interface BoardDto {
  id: string;
  projectId: string;
  name: string;
  isDefault: boolean;
}

export interface LabelDto {
  id: string;
  name: string;
  color: string;
}

export interface TaskDto {
  id: string;
  organizationId: string;
  projectId: string;
  boardId: string;
  columnId: string;
  statusId: string;
  number: number;
  /** Human reference, e.g. "TFG-42". */
  ref: string;
  type: TaskType;
  title: string;
  description: string;
  priority: TaskPriority;
  assigneeId: string | null;
  reporterId: string | null;
  parentTaskId: string | null;
  depth: number;
  position: number;
  storyPoints: number | null;
  startDate: string | null;
  dueDate: string | null;
  resolvedAt: string | null;
  archived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  labels: LabelDto[];
  commentCount: number;
  attachmentCount: number;
  subtaskCount: number;
  subtaskDoneCount: number;
}

export interface CommentDto {
  id: string;
  taskId: string;
  parentCommentId: string | null;
  body: string;
  author: UserRefDto | null;
  mentions: UserRefDto[];
  editedAt: string | null;
  createdAt: string;
}

export interface AttachmentDto {
  id: string;
  taskId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: UserRefDto | null;
  createdAt: string;
  downloadUrl: string;
}

export interface ActivityDto {
  id: string;
  projectId: string | null;
  entityType: EntityType;
  entityId: string;
  action: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  actor: UserRefDto | null;
  createdAt: string;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  message: string;
  projectId: string | null;
  taskId: string | null;
  commentId: string | null;
  actor: UserRefDto | null;
  readAt: string | null;
  createdAt: string;
}

/** Everything the board view needs, in one round trip. */
export interface BoardSnapshotDto {
  project: ProjectDto;
  board: BoardDto;
  boards: BoardDto[];
  statuses: WorkflowStatusDto[];
  columns: BoardColumnDto[];
  tasks: TaskDto[];
  labels: LabelDto[];
  members: ProjectMemberDto[];
  viewMode: BoardViewMode;
  permissions: string[];
}
