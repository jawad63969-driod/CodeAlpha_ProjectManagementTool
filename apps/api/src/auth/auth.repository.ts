import { and, eq, isNull, or } from 'drizzle-orm';
import { db, type Executor } from '../db/client.js';
import { organizationMembers, organizations, sessions, users } from '../db/schema.js';

/**
 * Data access for identity. Every function takes an optional executor so it can
 * participate in a caller's transaction — the repositories never open one
 * themselves, because only a service knows what belongs in the same unit of work.
 */
export const authRepository = {
  findUserByEmail: (email: string, tx: Executor = db) =>
    tx.select().from(users).where(eq(users.email, email)).get(),

  findUserById: (id: string, tx: Executor = db) =>
    tx.select().from(users).where(eq(users.id, id)).get(),

  insertUser: (row: typeof users.$inferInsert, tx: Executor = db) =>
    tx.insert(users).values(row).run(),

  updateUser: (id: string, patch: Partial<typeof users.$inferInsert>, tx: Executor = db) =>
    tx.update(users).set(patch).where(eq(users.id, id)).run(),

  insertOrganization: (row: typeof organizations.$inferInsert, tx: Executor = db) =>
    tx.insert(organizations).values(row).run(),

  findOrganizationById: (id: string, tx: Executor = db) =>
    tx.select().from(organizations).where(eq(organizations.id, id)).get(),

  updateOrganization: (id: string, patch: Partial<typeof organizations.$inferInsert>, tx: Executor = db) =>
    tx.update(organizations).set(patch).where(eq(organizations.id, id)).run(),

  findOrganizationBySlug: (slug: string, tx: Executor = db) =>
    tx.select().from(organizations).where(eq(organizations.slug, slug)).get(),

  insertMembership: (row: typeof organizationMembers.$inferInsert, tx: Executor = db) =>
    tx.insert(organizationMembers).values(row).run(),

  /** The authorization hot path: one point lookup on a unique index. */
  findMembership: (organizationId: string, userId: string, tx: Executor = db) =>
    tx
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
      .get(),

  listMembershipsForUser: (userId: string, tx: Executor = db) =>
    tx
      .select({ membership: organizationMembers, organization: organizations })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, userId))
      .orderBy(organizationMembers.joinedAt)
      .all(),

  listMembers: (organizationId: string, tx: Executor = db) =>
    tx
      .select({ member: organizationMembers, user: users })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, organizationId))
      .all(),

  countOwners: (organizationId: string, tx: Executor = db) =>
    tx
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.role, 'OWNER'),
          eq(organizationMembers.status, 'ACTIVE'),
        ),
      )
      .all().length,

  updateMembership: (
    organizationId: string,
    userId: string,
    patch: Partial<typeof organizationMembers.$inferInsert>,
    tx: Executor = db,
  ) =>
    tx
      .update(organizationMembers)
      .set(patch)
      .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
      .run(),

  deleteMembership: (organizationId: string, userId: string, tx: Executor = db) =>
    tx
      .delete(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
      .run(),

  /* ---- sessions ---- */

  insertSession: (row: typeof sessions.$inferInsert, tx: Executor = db) =>
    tx.insert(sessions).values(row).run(),

  findSessionByTokenHash: (tokenHash: string, tx: Executor = db) =>
    tx.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).get(),

  findSessionById: (id: string, tx: Executor = db) =>
    tx.select().from(sessions).where(eq(sessions.id, id)).get(),

  /**
   * Conditional rotation: only succeeds while the token is still unused.
   * Returns the number of rows changed, so a caller can distinguish "rotated"
   * from "someone rotated this a moment ago" without a second read.
   */
  markRotatedIfUnused: (id: string, at: string, tx: Executor = db) =>
    tx
      .update(sessions)
      .set({ rotatedAt: at })
      .where(and(eq(sessions.id, id), isNull(sessions.rotatedAt)))
      .run().changes,

  revokeSession: (id: string, at: string, tx: Executor = db) =>
    tx.update(sessions).set({ revokedAt: at }).where(eq(sessions.id, id)).run(),

  /** Revokes every token in a rotation chain — the response to reuse detection. */
  revokeFamily: (familyId: string, at: string, tx: Executor = db) =>
    tx
      .update(sessions)
      .set({ revokedAt: at })
      .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)))
      .run(),

  revokeAllForUser: (userId: string, at: string, tx: Executor = db) =>
    tx
      .update(sessions)
      .set({ revokedAt: at })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .run(),

  /**
   * Revokes only the sessions minted for one workspace. Suspending or removing
   * someone from workspace A must not sign them out of workspace B.
   */
  revokeForUserInOrganization: (userId: string, organizationId: string, at: string, tx: Executor = db) =>
    tx
      .update(sessions)
      .set({ revokedAt: at })
      .where(
        and(
          eq(sessions.userId, userId),
          eq(sessions.organizationId, organizationId),
          isNull(sessions.revokedAt),
        ),
      )
      .run(),

  listActiveSessions: (userId: string, tx: Executor = db) =>
    tx
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), or(isNull(sessions.rotatedAt))))
      .all(),
};
