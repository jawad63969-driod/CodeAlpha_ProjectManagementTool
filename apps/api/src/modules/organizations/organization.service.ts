import { OrgRole, type AddOrgMemberInput, type OrgMemberDto } from '@taskforge/shared';
import { AppError } from '../../core/errors.js';
import { ID_PREFIX, newId } from '../../core/ids.js';
import { nowIso } from '../../core/result.js';
import { authRepository as repo } from '../../auth/auth.repository.js';
import type { AuthContext } from '../../auth/context.js';

const toMemberDto = (row: {
  member: { role: string; status: string; joinedAt: string };
  user: { id: string; name: string; email: string; jobTitle: string | null; avatarColor: string; timezone: string };
}): OrgMemberDto => ({
  id: row.user.id,
  name: row.user.name,
  email: row.user.email,
  jobTitle: row.user.jobTitle,
  avatarColor: row.user.avatarColor,
  timezone: row.user.timezone,
  role: row.member.role as OrgRole,
  status: row.member.status as 'ACTIVE' | 'SUSPENDED',
  joinedAt: row.member.joinedAt,
});

/**
 * An ADMIN holds ORG_MEMBER_ROLE_UPDATE and ORG_MEMBER_REMOVE, so without this
 * a subordinate could suspend or evict an OWNER — locking them out and revoking
 * all of their sessions. The rank check used to exist in updateRole only.
 * Acting on yourself is always allowed; an owner leaving is caught separately
 * by the last-owner floor.
 */
const assertMayActOnOwner = (auth: AuthContext, targetRole: string): void => {
  if (targetRole !== OrgRole.OWNER) return;
  // An owner may act on an owner, including themselves; the last-owner floor in
  // each caller is what stops a workspace being left without one.
  if (auth.orgRole === OrgRole.OWNER) return;
  throw AppError.forbidden('Only an owner can act on another owner');
};

export const organizationService = {
  listMembers(auth: AuthContext): OrgMemberDto[] {
    return repo
      .listMembers(auth.organizationId)
      .map(toMemberDto)
      .sort((a, b) => {
        const rank = { OWNER: 0, ADMIN: 1, MEMBER: 2, GUEST: 3 } as const;
        return rank[a.role] - rank[b.role] || a.name.localeCompare(b.name);
      });
  },

  /**
   * Direct add-by-email. The token-based invitation flow was descoped in the
   * re-baseline (PROJECT-PLAN §9.2); the person must already have an account.
   */
  addMember(auth: AuthContext, input: AddOrgMemberInput): OrgMemberDto {
    const user = repo.findUserByEmail(input.email);
    if (!user) throw AppError.notFound('No account is registered with that email address');

    if (repo.findMembership(auth.organizationId, user.id)) {
      throw AppError.conflict('That person is already a member of this workspace');
    }

    repo.insertMembership({
      id: newId(ID_PREFIX.orgMember),
      organizationId: auth.organizationId,
      userId: user.id,
      role: input.role,
    });

    const added = repo
      .listMembers(auth.organizationId)
      .find((row) => row.user.id === user.id);
    return toMemberDto(added!);
  },

  updateRole(auth: AuthContext, userId: string, role: OrgRole): OrgMemberDto {
    const membership = repo.findMembership(auth.organizationId, userId);
    if (!membership) throw AppError.notFound('That person is not a member of this workspace');

    assertMayActOnOwner(auth, membership.role);
    if (membership.role === OrgRole.OWNER && repo.countOwners(auth.organizationId) <= 1) {
      throw AppError.conflict('This workspace must keep at least one owner');
    }

    repo.updateMembership(auth.organizationId, userId, { role });
    const updated = repo.listMembers(auth.organizationId).find((row) => row.user.id === userId);
    return toMemberDto(updated!);
  },

  setStatus(auth: AuthContext, userId: string, status: 'ACTIVE' | 'SUSPENDED'): OrgMemberDto {
    const membership = repo.findMembership(auth.organizationId, userId);
    if (!membership) throw AppError.notFound('That person is not a member of this workspace');
    assertMayActOnOwner(auth, membership.role);
    if (membership.role === OrgRole.OWNER && status === 'SUSPENDED' && repo.countOwners(auth.organizationId) <= 1) {
      throw AppError.conflict('This workspace must keep at least one active owner');
    }

    repo.updateMembership(auth.organizationId, userId, { status });
    // Suspension takes effect immediately: every session of that user is revoked.
    if (status === 'SUSPENDED') repo.revokeForUserInOrganization(userId, auth.organizationId, nowIso());

    const updated = repo.listMembers(auth.organizationId).find((row) => row.user.id === userId);
    return toMemberDto(updated!);
  },

  removeMember(auth: AuthContext, userId: string): void {
    const membership = repo.findMembership(auth.organizationId, userId);
    if (!membership) throw AppError.notFound('That person is not a member of this workspace');

    assertMayActOnOwner(auth, membership.role);
    if (membership.role === OrgRole.OWNER && repo.countOwners(auth.organizationId) <= 1) {
      throw AppError.conflict('This workspace must keep at least one owner (FR-B-05)');
    }
    if (userId === auth.userId && auth.orgRole === OrgRole.OWNER && repo.countOwners(auth.organizationId) <= 1) {
      throw AppError.conflict('Transfer ownership before leaving the workspace');
    }

    repo.deleteMembership(auth.organizationId, userId);
    repo.revokeForUserInOrganization(userId, auth.organizationId, nowIso());
  },

  rename(auth: AuthContext, name: string) {
    const organization = repo.findOrganizationById(auth.organizationId);
    if (!organization) throw AppError.notFound('Workspace not found');
    repo.updateOrganization(auth.organizationId, { name, updatedAt: nowIso() });
    return { id: organization.id, name, slug: organization.slug };
  },
};
