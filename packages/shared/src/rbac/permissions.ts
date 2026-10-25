import { OrgRole, ProjectRole } from './roles.js';

/**
 * The permission catalogue. Every mutating route declares exactly one of these,
 * and `authorize()` is the only place that decides whether it is granted.
 *
 * Naming: `<resource>.<action>[.<qualifier>]`.
 */
export const Permission = {
  // organisation
  ORG_READ: 'org.read',
  ORG_UPDATE: 'org.update',
  ORG_MEMBER_READ: 'org.member.read',
  ORG_MEMBER_ADD: 'org.member.add',
  ORG_MEMBER_ROLE_UPDATE: 'org.member.role.update',
  ORG_MEMBER_REMOVE: 'org.member.remove',
  ORG_ACTIVITY_READ: 'org.activity.read',

  // project
  PROJECT_CREATE: 'project.create',
  PROJECT_READ: 'project.read',
  PROJECT_UPDATE: 'project.update',
  PROJECT_ARCHIVE: 'project.archive',
  PROJECT_DELETE: 'project.delete',
  PROJECT_MEMBER_MANAGE: 'project.member.manage',

  // board configuration
  BOARD_CONFIGURE: 'board.configure',

  // work items
  TASK_CREATE: 'task.create',
  TASK_UPDATE: 'task.update',
  TASK_MOVE: 'task.move',
  TASK_DELETE: 'task.delete',
  TASK_DELETE_ANY: 'task.delete.any',

  // collaboration
  COMMENT_CREATE: 'comment.create',
  COMMENT_UPDATE_OWN: 'comment.update.own',
  COMMENT_DELETE_ANY: 'comment.delete.any',
  ATTACHMENT_CREATE: 'attachment.create',
  ATTACHMENT_DELETE_ANY: 'attachment.delete.any',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const P = Permission;

/**
 * Grants that come from the organisation role. An org ADMIN reaches every
 * project in the tenant; a MEMBER reaches only projects they belong to and
 * therefore gets its project-scoped rights from the project matrix instead.
 */
export const ORG_ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  [OrgRole.OWNER]: Object.values(P),
  [OrgRole.ADMIN]: [
    P.ORG_READ, P.ORG_UPDATE, P.ORG_MEMBER_READ, P.ORG_MEMBER_ADD,
    P.ORG_MEMBER_ROLE_UPDATE, P.ORG_MEMBER_REMOVE, P.ORG_ACTIVITY_READ,
    P.PROJECT_CREATE, P.PROJECT_READ, P.PROJECT_UPDATE, P.PROJECT_ARCHIVE,
    P.PROJECT_MEMBER_MANAGE, P.BOARD_CONFIGURE,
    P.TASK_CREATE, P.TASK_UPDATE, P.TASK_MOVE, P.TASK_DELETE, P.TASK_DELETE_ANY,
    P.COMMENT_CREATE, P.COMMENT_UPDATE_OWN, P.COMMENT_DELETE_ANY,
    P.ATTACHMENT_CREATE, P.ATTACHMENT_DELETE_ANY,
  ],
  [OrgRole.MEMBER]: [P.ORG_READ, P.ORG_MEMBER_READ, P.PROJECT_CREATE],
  [OrgRole.GUEST]: [P.ORG_READ],
} as const;

/** Grants that come from membership of one specific project. */
export const PROJECT_ROLE_PERMISSIONS: Record<ProjectRole, readonly Permission[]> = {
  [ProjectRole.PROJECT_MANAGER]: [
    P.PROJECT_READ, P.PROJECT_UPDATE, P.PROJECT_ARCHIVE, P.PROJECT_MEMBER_MANAGE,
    P.BOARD_CONFIGURE,
    P.TASK_CREATE, P.TASK_UPDATE, P.TASK_MOVE, P.TASK_DELETE, P.TASK_DELETE_ANY,
    P.COMMENT_CREATE, P.COMMENT_UPDATE_OWN, P.COMMENT_DELETE_ANY,
    P.ATTACHMENT_CREATE, P.ATTACHMENT_DELETE_ANY,
  ],
  [ProjectRole.DEVELOPER]: [
    P.PROJECT_READ,
    P.TASK_CREATE, P.TASK_UPDATE, P.TASK_MOVE, P.TASK_DELETE,
    P.COMMENT_CREATE, P.COMMENT_UPDATE_OWN,
    P.ATTACHMENT_CREATE,
  ],
  [ProjectRole.VIEWER]: [P.PROJECT_READ],
} as const;

/**
 * Effective permission = union of what the org role grants and what the
 * project role grants. Passing `null` for the project role means "the caller is
 * not a member of this project", in which case only org-derived grants apply.
 */
export const resolvePermissions = (
  orgRole: OrgRole,
  projectRole: ProjectRole | null,
): ReadonlySet<Permission> => {
  const granted = new Set<Permission>(ORG_ROLE_PERMISSIONS[orgRole]);
  if (projectRole) {
    for (const permission of PROJECT_ROLE_PERMISSIONS[projectRole]) granted.add(permission);
  }
  return granted;
};

export const hasPermission = (
  orgRole: OrgRole,
  projectRole: ProjectRole | null,
  permission: Permission,
): boolean => resolvePermissions(orgRole, projectRole).has(permission);
