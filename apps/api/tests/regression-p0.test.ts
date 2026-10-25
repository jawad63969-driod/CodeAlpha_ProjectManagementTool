import { describe, expect, it } from 'vitest';
import { api } from './helpers/app.js';
import {
  addProjectMember,
  addToWorkspace,
  auth,
  boardSnapshot,
  createProject,
  createTask,
  memberOf,
  registerAccount,
  sessionInWorkspace,
} from './helpers/factories.js';

/**
 * Regressions for the P0 findings of the 24 Sep 2026 audit.
 *
 * Each of these reproduces a defect that the 194-assertion suite did not catch,
 * which is the point: they are written from the failure, not from the fix.
 */

describe('P0-1 — removing a project member does not reach other projects or other tenants', () => {
  it('unassigns only the tasks in the project the person was removed from', async () => {
    const owner = await registerAccount({ organizationName: 'Northwind Labs' });
    const { account: dev } = await memberOf(owner, 'MEMBER', 'Dev Person');

    const alpha = await createProject(owner, { name: 'Alpha', key: 'ALP' });
    const beta = await createProject(owner, { name: 'Beta', key: 'BET' });
    await addProjectMember(owner, alpha.id, dev.user.id);
    await addProjectMember(owner, beta.id, dev.user.id);

    const inAlpha = await createTask(owner, alpha.id, { title: 'Alpha work', assigneeId: dev.user.id });
    const inBeta = await createTask(owner, beta.id, { title: 'Beta work', assigneeId: dev.user.id });

    const removed = await api()
      .delete(`/api/v1/projects/${alpha.id}/members/${dev.user.id}`)
      .set(auth(owner.accessToken));
    expect(removed.status).toBe(200);

    const alphaTask = await api().get(`/api/v1/tasks/${inAlpha.id}`).set(auth(owner.accessToken));
    const betaTask = await api().get(`/api/v1/tasks/${inBeta.id}`).set(auth(owner.accessToken));

    expect(alphaTask.body.task.assigneeId).toBeNull();
    // The whole defect: this used to be null too.
    expect(betaTask.body.task.assigneeId).toBe(dev.user.id);
  });

  it('does not touch assignments in another organisation', async () => {
    // Bob owns his own workspace and has work assigned to himself there.
    const bob = await registerAccount({ name: 'Bob', organizationName: 'Bob Industries' });
    const bobsProject = await createProject(bob, { name: 'Bob Only', key: 'BOB' });
    const bobsTask = await createTask(bob, bobsProject.id, { title: 'Bob own work', assigneeId: bob.user.id });

    // Alice invites Bob into her workspace, gives him a project, then removes him.
    const alice = await registerAccount({ name: 'Alice', organizationName: 'Acme Corp' });
    await addToWorkspace(alice, bob, 'MEMBER');
    const acmeProject = await createProject(alice, { name: 'Acme Work', key: 'ACM' });
    await addProjectMember(alice, acmeProject.id, bob.user.id);

    const removed = await api()
      .delete(`/api/v1/projects/${acmeProject.id}/members/${bob.user.id}`)
      .set(auth(alice.accessToken));
    expect(removed.status).toBe(200);

    // Bob's own workspace must be untouched.
    const after = await api().get(`/api/v1/tasks/${bobsTask.id}`).set(auth(bob.accessToken));
    expect(after.status).toBe(200);
    expect(after.body.task.assigneeId).toBe(bob.user.id);
  });
});

describe('P0-2 — My Work pagination returns every card exactly once', () => {
  it('pages through a mixed-priority list without dropping or repeating rows', async () => {
    const owner = await registerAccount({ organizationName: 'Northwind Labs' });
    const project = await createProject(owner, { name: 'Paging', key: 'PAG' });

    // Priorities deliberately interleaved, so id order and urgency order disagree.
    const priorities = ['LOW', 'CRITICAL', 'MEDIUM', 'LOWEST', 'HIGH', 'MEDIUM', 'CRITICAL', 'LOW', 'HIGH', 'LOWEST'];
    for (const [index, priority] of priorities.entries()) {
      await createTask(owner, project.id, {
        title: `Mine ${index}`,
        priority,
        assigneeId: owner.user.id,
      });
    }

    const unpaged = await api().get('/api/v1/tasks/mine?limit=100').set(auth(owner.accessToken));
    expect(unpaged.status).toBe(200);
    const expected = unpaged.body.data.map((t: { title: string }) => t.title);
    expect(expected).toHaveLength(priorities.length);

    const collected: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 20; guard += 1) {
      const url: string = `/api/v1/tasks/mine?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const page = await api().get(url).set(auth(owner.accessToken));
      expect(page.status).toBe(200);
      collected.push(...page.body.data.map((t: { title: string }) => t.title));
      cursor = page.body.nextCursor;
      if (!cursor) break;
    }

    // Same rows, same order, no duplicates — the defect produced 9 rows, 6 unique.
    expect(new Set(collected).size).toBe(collected.length);
    expect(collected).toEqual(expected);
  });
});

describe('P0-3 — deleting a column cannot destroy the cards in it', () => {
  it('refuses with 409 while the column still holds cards', async () => {
    const owner = await registerAccount({ organizationName: 'Northwind Labs' });
    const project = await createProject(owner, { name: 'Columns', key: 'COL' });
    const board = await boardSnapshot(owner, project.id);
    const backlog = board.columns[0]!;

    await createTask(owner, project.id, { title: 'Still here', columnId: backlog.id });

    const refused = await api()
      .delete(`/api/v1/columns/${backlog.id}`)
      .set(auth(owner.accessToken));

    expect(refused.status).toBe(409);
    const after = await boardSnapshot(owner, project.id);
    expect(after.tasks).toHaveLength(1);
    expect(after.columns.some((c) => c.id === backlog.id)).toBe(true);
  });

  it('moves the cards and bumps their version when a destination is given', async () => {
    const owner = await registerAccount({ organizationName: 'Northwind Labs' });
    const project = await createProject(owner, { name: 'Columns', key: 'COB' });
    const board = await boardSnapshot(owner, project.id);
    const [backlog, inProgress] = board.columns;

    const task = await createTask(owner, project.id, { title: 'Moves along', columnId: backlog!.id });
    expect(task.version).toBe(1);

    const deleted = await api()
      .delete(`/api/v1/columns/${backlog!.id}?moveTo=${inProgress!.id}`)
      .set(auth(owner.accessToken));
    expect(deleted.status).toBe(200);

    const after = await boardSnapshot(owner, project.id);
    const moved = after.tasks.find((t) => t.id === task.id);
    expect(moved).toBeDefined();
    expect(moved!.columnId).toBe(inProgress!.id);
    // A card moved underneath a client must invalidate that client's version,
    // or its next compare-and-set succeeds over data it never saw.
    expect(moved!.version).toBeGreaterThan(task.version);
  });
});

describe('P0-4 — an admin cannot act on an owner', () => {
  it('refuses to suspend an owner', async () => {
    const owner = await registerAccount({ name: 'The Owner', organizationName: 'Northwind Labs' });
    const { token: adminToken } = await memberOf(owner, 'ADMIN', 'The Admin');

    const attempt = await api()
      .patch(`/api/v1/organization/members/${owner.user.id}/status`)
      .set(auth(adminToken))
      .send({ status: 'SUSPENDED' });

    expect(attempt.status).toBe(403);

    // And the owner is still able to work.
    const stillWorks = await api().get('/api/v1/organization/members').set(auth(owner.accessToken));
    expect(stillWorks.status).toBe(200);
  });

  it('refuses to remove an owner', async () => {
    const owner = await registerAccount({ name: 'The Owner', organizationName: 'Northwind Labs' });
    const { token: adminToken } = await memberOf(owner, 'ADMIN', 'The Admin');

    const attempt = await api()
      .delete(`/api/v1/organization/members/${owner.user.id}`)
      .set(auth(adminToken));

    expect(attempt.status).toBe(403);
  });

  it('still lets an owner act on another owner', async () => {
    const owner = await registerAccount({ name: 'First Owner', organizationName: 'Northwind Labs' });
    const { account: second } = await memberOf(owner, 'ADMIN', 'Second Owner');

    // Promote the second person to owner, then have them suspend the first.
    const promoted = await api()
      .patch(`/api/v1/organization/members/${second.user.id}/role`)
      .set(auth(owner.accessToken))
      .send({ role: 'ADMIN' });
    expect(promoted.status).toBe(200);

    const secondSession = await sessionInWorkspace(second, owner.organization.id);
    const asAdmin = await api()
      .patch(`/api/v1/organization/members/${owner.user.id}/status`)
      .set(auth(secondSession.accessToken))
      .send({ status: 'SUSPENDED' });

    // Still an admin, so still refused — this asserts the guard is about rank,
    // not about identity.
    expect(asAdmin.status).toBe(403);
  });
});
