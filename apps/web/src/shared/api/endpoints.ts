import type {
  ActivityDto, AttachmentDto, BoardColumnDto, BoardSnapshotDto, CommentDto, LabelDto,
  NotificationDto, OrganizationDto, OrgMemberDto, OrgRole, Page, ProjectDto, ProjectMemberDto,
  ProjectRole, SessionDto, TaskDto, UserDto,
} from '@taskforge/shared';
import { api } from './client.js';

/** Query keys in one place, so an invalidation can never miss a cache. */
export const keys = {
  session: ['session'] as const,
  workspaces: ['workspaces'] as const,
  organization: ['organization'] as const,
  orgMembers: ['org-members'] as const,
  projects: ['projects'] as const,
  board: (projectId: string) => ['board', projectId] as const,
  task: (taskId: string) => ['task', taskId] as const,
  subtasks: (taskId: string) => ['subtasks', taskId] as const,
  comments: (taskId: string) => ['comments', taskId] as const,
  attachments: (taskId: string) => ['attachments', taskId] as const,
  taskActivity: (taskId: string) => ['task-activity', taskId] as const,
  projectActivity: (projectId: string) => ['project-activity', projectId] as const,
  notifications: ['notifications'] as const,
  myWork: ['my-work'] as const,
};

export const endpoints = {
  // auth
  login: (body: { email: string; password: string }) => api.post<SessionDto>('/auth/login', body),
  register: (body: { name: string; email: string; password: string; organizationName?: string }) =>
    api.post<SessionDto>('/auth/register', body),
  logout: (refreshToken: string) => api.post<{ ok: true }>('/auth/logout', { refreshToken }),
  me: () => api.get<{ user: UserDto; organization: OrganizationDto; orgRole: OrgRole }>('/auth/me'),
  updateProfile: (body: { name?: string; jobTitle?: string | null }) =>
    api.patch<{ user: UserDto }>('/auth/me', body),
  workspaces: () =>
    api.get<{ workspaces: Array<{ organization: OrganizationDto; orgRole: OrgRole; status: string }> }>('/auth/workspaces'),
  switchWorkspace: (organizationId: string) =>
    api.post<SessionDto>('/auth/workspaces/switch', { organizationId }),

  // organisation
  organization: () =>
    api.get<{ organization: OrganizationDto; orgRole: OrgRole; permissions: string[] }>('/organization'),
  orgMembers: () => api.get<{ members: OrgMemberDto[] }>('/organization/members'),
  addOrgMember: (body: { email: string; role: string }) =>
    api.post<{ member: OrgMemberDto }>('/organization/members', body),
  setOrgRole: (userId: string, role: string) =>
    api.patch<{ member: OrgMemberDto }>(`/organization/members/${userId}/role`, { role }),
  removeOrgMember: (userId: string) => api.del<{ ok: true }>(`/organization/members/${userId}`),

  // projects
  projects: (includeArchived = false) =>
    api.get<{ projects: ProjectDto[] }>(`/projects${includeArchived ? '?includeArchived=true' : ''}`),
  createProject: (body: { name: string; key?: string; description?: string; color?: string }) =>
    api.post<{ project: ProjectDto }>('/projects', body),
  updateProject: (projectId: string, body: Record<string, unknown>) =>
    api.patch<{ project: ProjectDto }>(`/projects/${projectId}`, body),
  deleteProject: (projectId: string) => api.del<{ ok: true }>(`/projects/${projectId}`),
  projectMembers: (projectId: string) =>
    api.get<{ members: ProjectMemberDto[] }>(`/projects/${projectId}/members`),
  addProjectMember: (projectId: string, userId: string, role: ProjectRole) =>
    api.post<{ member: ProjectMemberDto }>(`/projects/${projectId}/members`, { userId, role }),
  setProjectRole: (projectId: string, userId: string, role: ProjectRole) =>
    api.patch<{ member: ProjectMemberDto }>(`/projects/${projectId}/members/${userId}`, { role }),
  removeProjectMember: (projectId: string, userId: string) =>
    api.del<{ ok: true }>(`/projects/${projectId}/members/${userId}`),

  // board
  board: (projectId: string) => api.get<BoardSnapshotDto>(`/projects/${projectId}/board`),
  createColumn: (projectId: string, body: { name: string; category: string }) =>
    api.post<{ column: BoardColumnDto }>(`/projects/${projectId}/columns`, body),
  updateColumn: (columnId: string, body: { name?: string }) =>
    api.patch<{ column: BoardColumnDto }>(`/columns/${columnId}`, body),
  deleteColumn: (columnId: string, moveTo?: string) =>
    api.del<{ ok: true; movedTasksTo: string | null }>(`/columns/${columnId}${moveTo ? `?moveTo=${moveTo}` : ''}`),
  reorderColumns: (projectId: string, orderedColumnIds: string[]) =>
    api.patch<{ columns: BoardColumnDto[] }>(`/projects/${projectId}/columns/reorder`, { orderedColumnIds }),
  createLabel: (projectId: string, body: { name: string; color: string }) =>
    api.post<{ label: LabelDto }>(`/projects/${projectId}/labels`, body),

  // tasks
  createTask: (projectId: string, body: Record<string, unknown>) =>
    api.post<{ task: TaskDto }>(`/projects/${projectId}/tasks`, body),
  task: (taskId: string) => api.get<{ task: TaskDto }>(`/tasks/${taskId}`),
  subtasks: (taskId: string) => api.get<{ tasks: TaskDto[] }>(`/tasks/${taskId}/subtasks`),
  updateTask: (taskId: string, body: Record<string, unknown>) =>
    api.patch<{ task: TaskDto }>(`/tasks/${taskId}`, body),
  moveTask: (taskId: string, body: { columnId: string; index: number; version?: number }) =>
    api.post<{ task: TaskDto; fromColumnId: string }>(`/tasks/${taskId}/move`, body),
  deleteTask: (taskId: string, strategy: 'REPARENT' | 'CASCADE' = 'REPARENT') =>
    api.del<{ ok: true; reparentedTo: string | null }>(`/tasks/${taskId}?strategy=${strategy}`),
  myWork: () => api.get<Page<TaskDto>>('/tasks/mine'),

  // collaboration
  comments: (taskId: string) => api.get<{ comments: CommentDto[] }>(`/tasks/${taskId}/comments`),
  createComment: (taskId: string, body: { body: string; parentCommentId?: string | null }) =>
    api.post<{ comment: CommentDto }>(`/tasks/${taskId}/comments`, body),
  updateComment: (commentId: string, body: string) =>
    api.patch<{ comment: CommentDto }>(`/comments/${commentId}`, { body }),
  deleteComment: (commentId: string) => api.del<{ ok: true }>(`/comments/${commentId}`),

  attachments: (taskId: string) => api.get<{ attachments: AttachmentDto[] }>(`/tasks/${taskId}/attachments`),
  uploadAttachment: (taskId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload<{ attachment: AttachmentDto }>(`/tasks/${taskId}/attachments`, form);
  },
  deleteAttachment: (attachmentId: string) => api.del<{ ok: true }>(`/attachments/${attachmentId}`),

  taskActivity: (taskId: string) => api.get<Page<ActivityDto>>(`/tasks/${taskId}/activity`),
  projectActivity: (projectId: string) => api.get<Page<ActivityDto>>(`/projects/${projectId}/activity?limit=50`),

  // notifications
  notifications: () => api.get<Page<NotificationDto> & { unread: number }>('/notifications?limit=30'),
  markNotificationRead: (id: string) => api.patch<{ ok: true; unread: number }>(`/notifications/${id}/read`),
  markAllNotificationsRead: () => api.post<{ ok: true; unread: number }>('/notifications/read-all'),
};
