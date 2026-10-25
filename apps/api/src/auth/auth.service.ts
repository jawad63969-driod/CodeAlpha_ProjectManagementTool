import {
  OrgRole,
  type LoginInput,
  type OrganizationDto,
  type RegisterInput,
  type SessionDto,
  type UpdateProfileInput,
  type UserDto,
} from '@taskforge/shared';
import { db } from '../db/client.js';
import { AppError } from '../core/errors.js';
import { ID_PREFIX, newId } from '../core/ids.js';
import { nowIso } from '../core/result.js';
import { authRepository as repo } from './auth.repository.js';
import { burnTiming, hashPassword, verifyPassword } from './password.js';
import {
  accessTokenTtlSeconds,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
} from './tokens.js';
import type { users as usersTable, organizations as orgTable } from '../db/schema.js';

type UserRow = typeof usersTable.$inferSelect;
type OrgRow = typeof orgTable.$inferSelect;

export interface RequestMeta {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

const AVATAR_PALETTE = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#22c55e'];

/** Deterministic avatar colour, so a person looks the same everywhere. */
const colorFor = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]!;
};

const slugify = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'workspace';

export const toUserDto = (row: UserRow): UserDto => ({
  id: row.id,
  name: row.name,
  email: row.email,
  jobTitle: row.jobTitle,
  avatarColor: row.avatarColor,
  timezone: row.timezone,
});

export const toOrganizationDto = (row: OrgRow): OrganizationDto => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
});

/** Issues a fresh token pair and opens a new rotation family. */
const openSession = (userId: string, organizationId: string, meta: RequestMeta) => {
  const refreshToken = generateRefreshToken();
  const sessionId = newId(ID_PREFIX.session);
  const familyId = newId(ID_PREFIX.family);

  repo.insertSession({
    id: sessionId,
    userId,
    organizationId,
    familyId,
    tokenHash: hashRefreshToken(refreshToken),
    userAgent: meta.userAgent ?? null,
    ipAddress: meta.ipAddress ?? null,
    expiresAt: refreshTokenExpiry(),
  });

  return {
    accessToken: signAccessToken({ userId, organizationId, sessionId }),
    refreshToken,
    expiresIn: accessTokenTtlSeconds(),
  };
};

export const authService = {
  /**
   * Registration provisions a personal organisation with the registrant as its
   * OWNER (FR-B-01), so a new account lands in a usable workspace immediately.
   * The password is hashed before the transaction opens, because better-sqlite3
   * transactions are synchronous and cannot await.
   */
  async register(input: RegisterInput, meta: RequestMeta): Promise<SessionDto> {
    if (repo.findUserByEmail(input.email)) {
      throw AppError.conflict('An account with that email already exists');
    }
    const passwordHash = await hashPassword(input.password);

    const { user, organization } = db.transaction((tx) => {
      const userId = newId(ID_PREFIX.user);
      const organizationId = newId(ID_PREFIX.organization);
      const orgName = input.organizationName?.trim() || `${input.name.split(/\s+/)[0]}'s Workspace`;

      let slug = slugify(orgName);
      if (repo.findOrganizationBySlug(slug, tx)) slug = `${slug}-${organizationId.slice(-6).toLowerCase()}`;

      repo.insertUser(
        {
          id: userId,
          email: input.email,
          passwordHash,
          name: input.name,
          avatarColor: colorFor(input.email),
        },
        tx,
      );
      repo.insertOrganization({ id: organizationId, name: orgName, slug }, tx);
      repo.insertMembership(
        { id: newId(ID_PREFIX.orgMember), organizationId, userId, role: OrgRole.OWNER },
        tx,
      );

      return {
        user: repo.findUserById(userId, tx)!,
        organization: repo.findOrganizationById(organizationId, tx)!,
      };
    });

    return {
      user: toUserDto(user),
      organization: toOrganizationDto(organization),
      orgRole: OrgRole.OWNER,
      ...openSession(user.id, organization.id, meta),
    };
  },

  /**
   * Unknown email and wrong password are indistinguishable in status, body and
   * timing class (FR-A-05).
   */
  async login(input: LoginInput, meta: RequestMeta): Promise<SessionDto> {
    const user = repo.findUserByEmail(input.email);
    if (!user) {
      await burnTiming(input.password);
      throw AppError.invalidCredentials();
    }
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw AppError.invalidCredentials();
    if (!user.isActive) throw AppError.forbidden('This account has been deactivated');

    const memberships = repo.listMembershipsForUser(user.id);
    const active = memberships.find((m) => m.membership.status === 'ACTIVE');
    if (!active) throw AppError.forbidden('Your access to every workspace has been suspended');

    repo.updateUser(user.id, { lastLoginAt: nowIso() });

    return {
      user: toUserDto(user),
      organization: toOrganizationDto(active.organization),
      orgRole: active.membership.role as OrgRole,
      ...openSession(user.id, active.organization.id, meta),
    };
  },

  /**
   * Rotation with reuse detection (FR-A-04).
   *
   * Subtlety worth stating plainly: revoking the family CANNOT happen inside
   * the rotation transaction, because the `throw` that reports the breach would
   * roll that revocation straight back — the attack would be detected and then
   * silently forgiven. So the transaction *reports* reuse as a value, and the
   * revocation is committed on its own before the error is raised.
   *
   * The rotation itself is a conditional UPDATE (`... WHERE rotated_at IS NULL`),
   * so two refreshes racing on the same token cannot both succeed: the loser
   * sees zero rows changed and is treated as reuse.
   */
  refresh(refreshToken: string, meta: RequestMeta): { accessToken: string; refreshToken: string; expiresIn: number } {
    const presentedHash = hashRefreshToken(refreshToken);

    const outcome = db.transaction((tx) => {
      const session = repo.findSessionByTokenHash(presentedHash, tx);
      if (!session) return { kind: 'unknown' } as const;

      const now = nowIso();
      if (session.revokedAt) return { kind: 'revoked' } as const;
      if (session.expiresAt <= now) return { kind: 'expired' } as const;
      if (session.rotatedAt) return { kind: 'reuse', familyId: session.familyId } as const;

      const user = repo.findUserById(session.userId, tx);
      if (!user || !user.isActive) return { kind: 'inactive' } as const;

      // A refresh stays inside the workspace the session was minted for —
      // it must never silently relocate the caller to a different tenant.
      const membership = repo.findMembership(session.organizationId, session.userId, tx);
      if (!membership || membership.status !== 'ACTIVE') return { kind: 'suspended' } as const;

      // Retire the presented token. Zero rows changed means it was already
      // rotated between our read and this write — that is reuse, not success.
      if (repo.markRotatedIfUnused(session.id, now, tx) === 0) {
        return { kind: 'reuse', familyId: session.familyId } as const;
      }

      const nextToken = generateRefreshToken();
      const nextSessionId = newId(ID_PREFIX.session);
      repo.insertSession(
        {
          id: nextSessionId,
          userId: session.userId,
          familyId: session.familyId,
          tokenHash: hashRefreshToken(nextToken),
          organizationId: session.organizationId,
          userAgent: meta.userAgent ?? session.userAgent,
          ipAddress: meta.ipAddress ?? session.ipAddress,
          expiresAt: session.expiresAt,
        },
        tx,
      );

      return {
        kind: 'rotated',
        tokens: {
          accessToken: signAccessToken({
            userId: session.userId,
            organizationId: session.organizationId,
            sessionId: nextSessionId,
          }),
          refreshToken: nextToken,
          expiresIn: accessTokenTtlSeconds(),
        },
      } as const;
    });

    switch (outcome.kind) {
      case 'rotated':
        return outcome.tokens;
      case 'reuse':
        // Committed outside the transaction above, so the breach response sticks.
        repo.revokeFamily(outcome.familyId, nowIso());
        throw AppError.tokenReuse();
      case 'revoked':
        throw AppError.sessionExpired('That session was revoked');
      case 'expired':
        throw AppError.sessionExpired('That session has expired');
      case 'inactive':
        throw AppError.sessionExpired('This account is no longer active');
      case 'suspended':
        throw AppError.forbidden('Your access has been suspended');
      default:
        throw AppError.sessionExpired('That session is no longer valid');
    }
  },

  /** Signing out revokes the whole chain, not just the presented token. */
  logout(refreshToken: string): void {
    const session = repo.findSessionByTokenHash(hashRefreshToken(refreshToken));
    if (!session) return; // already gone — signing out twice is not an error
    repo.revokeFamily(session.familyId, nowIso());
  },

  /** Workspaces this person belongs to — drives the workspace switcher. */
  listWorkspaces(userId: string): Array<{ organization: OrganizationDto; orgRole: OrgRole; status: string }> {
    return repo.listMembershipsForUser(userId).map((row) => ({
      organization: toOrganizationDto(row.organization),
      orgRole: row.membership.role as OrgRole,
      status: row.membership.status,
    }));
  },

  /**
   * Access tokens are scoped to one organisation, so moving between workspaces
   * means minting a new session rather than reinterpreting the current one.
   */
  switchWorkspace(userId: string, organizationId: string, meta: RequestMeta): SessionDto {
    const membership = repo.findMembership(organizationId, userId);
    if (!membership) throw AppError.notFound('Workspace not found');
    if (membership.status !== 'ACTIVE') throw AppError.forbidden('Your access to that workspace is suspended');

    const user = repo.findUserById(userId);
    const organization = repo.findOrganizationById(organizationId);
    if (!user || !organization) throw AppError.notFound('Workspace not found');

    return {
      user: toUserDto(user),
      organization: toOrganizationDto(organization),
      orgRole: membership.role as OrgRole,
      ...openSession(userId, organizationId, meta),
    };
  },

  currentUser(userId: string, organizationId: string): { user: UserDto; organization: OrganizationDto; orgRole: OrgRole } {
    const user = repo.findUserById(userId);
    const organization = repo.findOrganizationById(organizationId);
    const membership = repo.findMembership(organizationId, userId);
    if (!user || !organization || !membership) throw AppError.unauthenticated('This session is no longer valid');
    return {
      user: toUserDto(user),
      organization: toOrganizationDto(organization),
      orgRole: membership.role as OrgRole,
    };
  },

  updateProfile(userId: string, input: UpdateProfileInput): UserDto {
    const current = repo.findUserById(userId);
    if (!current) throw AppError.unauthenticated('This session is no longer valid');

    repo.updateUser(userId, {
      name: input.name ?? current.name,
      jobTitle: input.jobTitle === undefined ? current.jobTitle : input.jobTitle,
      avatarColor: input.avatarColor ?? current.avatarColor,
      timezone: input.timezone ?? current.timezone,
      updatedAt: nowIso(),
    });
    return toUserDto(repo.findUserById(userId)!);
  },
};
