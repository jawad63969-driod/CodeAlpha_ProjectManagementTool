/** Organisation-level role. Grants apply across every project in the tenant. */
export const OrgRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  GUEST: 'GUEST',
} as const;
export type OrgRole = (typeof OrgRole)[keyof typeof OrgRole];

/** Project-level role. Grants apply inside one project only. */
export const ProjectRole = {
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  DEVELOPER: 'DEVELOPER',
  VIEWER: 'VIEWER',
} as const;
export type ProjectRole = (typeof ProjectRole)[keyof typeof ProjectRole];

export const ORG_ROLES = Object.values(OrgRole);
export const PROJECT_ROLES = Object.values(ProjectRole);

export const MemberStatus = { ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED' } as const;
export type MemberStatus = (typeof MemberStatus)[keyof typeof MemberStatus];
