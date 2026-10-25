import { describe, expect, it } from 'vitest';
import { OrgRole, Permission, ProjectRole, hasPermission, resolvePermissions } from '@taskforge/shared';

describe('permission resolution', () => {
  it('gives an organisation owner every permission', () => {
    const granted = resolvePermissions(OrgRole.OWNER, null);
    for (const permission of Object.values(Permission)) {
      expect(granted.has(permission)).toBe(true);
    }
  });

  it('lets an org admin reach any project without project membership', () => {
    expect(hasPermission(OrgRole.ADMIN, null, Permission.TASK_UPDATE)).toBe(true);
    expect(hasPermission(OrgRole.ADMIN, null, Permission.BOARD_CONFIGURE)).toBe(true);
  });

  it('reserves project deletion for the organisation owner', () => {
    expect(hasPermission(OrgRole.ADMIN, ProjectRole.PROJECT_MANAGER, Permission.PROJECT_DELETE)).toBe(false);
    expect(hasPermission(OrgRole.OWNER, null, Permission.PROJECT_DELETE)).toBe(true);
  });

  it('gives a plain member nothing inside a project they do not belong to', () => {
    expect(hasPermission(OrgRole.MEMBER, null, Permission.PROJECT_READ)).toBe(false);
    expect(hasPermission(OrgRole.MEMBER, null, Permission.TASK_CREATE)).toBe(false);
  });

  it('grants a developer write access only through project membership', () => {
    expect(hasPermission(OrgRole.MEMBER, ProjectRole.DEVELOPER, Permission.TASK_CREATE)).toBe(true);
    expect(hasPermission(OrgRole.MEMBER, ProjectRole.DEVELOPER, Permission.TASK_MOVE)).toBe(true);
    expect(hasPermission(OrgRole.MEMBER, ProjectRole.DEVELOPER, Permission.BOARD_CONFIGURE)).toBe(false);
    expect(hasPermission(OrgRole.MEMBER, ProjectRole.DEVELOPER, Permission.PROJECT_MEMBER_MANAGE)).toBe(false);
  });

  it('makes a viewer strictly read-only (FR-C-05)', () => {
    const writes = [
      Permission.TASK_CREATE, Permission.TASK_UPDATE, Permission.TASK_MOVE, Permission.TASK_DELETE,
      Permission.COMMENT_CREATE, Permission.ATTACHMENT_CREATE, Permission.BOARD_CONFIGURE,
      Permission.PROJECT_UPDATE, Permission.PROJECT_MEMBER_MANAGE,
    ];
    for (const permission of writes) {
      expect(hasPermission(OrgRole.MEMBER, ProjectRole.VIEWER, permission)).toBe(false);
    }
    expect(hasPermission(OrgRole.MEMBER, ProjectRole.VIEWER, Permission.PROJECT_READ)).toBe(true);
  });

  it('lets a project manager configure the board but not delete the project', () => {
    expect(hasPermission(OrgRole.MEMBER, ProjectRole.PROJECT_MANAGER, Permission.BOARD_CONFIGURE)).toBe(true);
    expect(hasPermission(OrgRole.MEMBER, ProjectRole.PROJECT_MANAGER, Permission.COMMENT_DELETE_ANY)).toBe(true);
    expect(hasPermission(OrgRole.MEMBER, ProjectRole.PROJECT_MANAGER, Permission.PROJECT_DELETE)).toBe(false);
  });

  it('unions org and project grants rather than letting one override the other', () => {
    const granted = resolvePermissions(OrgRole.GUEST, ProjectRole.DEVELOPER);
    expect(granted.has(Permission.ORG_READ)).toBe(true);
    expect(granted.has(Permission.TASK_CREATE)).toBe(true);
    expect(granted.has(Permission.PROJECT_CREATE)).toBe(false);
  });
});
