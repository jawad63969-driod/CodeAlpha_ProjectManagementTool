import { describe, expect, it } from 'vitest';
import { api } from './helpers/app.js';
import { addProjectMember, auth, boardSnapshot, createProject, createTask, memberOf, registerAccount } from './helpers/factories.js';

const setup = async () => {
  const owner = await registerAccount();
  const project = await createProject(owner, { name: 'TaskForge Platform', key: 'TFG' });
  const snapshot = await boardSnapshot(owner, project.id);
  return { owner, project, columns: snapshot.columns };
};

describe('creating work items', () => {
  it('lands in the initial column with a KEY-N reference', async () => {
    const { owner, project, columns } = await setup();
    const task = await createTask(owner, project.id, { title: 'Build the RBAC engine' });

    expect(task.ref).toBe('TFG-1');
    expect(task.number).toBe(1);
    expect(task.columnId).toBe(columns[0]!.id);
    expect(task.version).toBe(1);
    expect(task.resolvedAt).toBeNull();
  });

  it('numbers tasks sequentially and never reuses a number', async () => {
    const { owner, project } = await setup();
    const first = await createTask(owner, project.id, { title: 'One' });
    const second = await createTask(owner, project.id, { title: 'Two' });
    await api().delete(`/api/v1/tasks/${second.id}`).set(auth(owner.accessToken));
    const third = await createTask(owner, project.id, { title: 'Three' });

    expect([first.ref, second.ref, third.ref]).toEqual(['TFG-1', 'TFG-2', 'TFG-3']);
  });

  it('keeps insertion order within a column', async () => {
    const { owner, project } = await setup();
    await createTask(owner, project.id, { title: 'First' });
    await createTask(owner, project.id, { title: 'Second' });
    await createTask(owner, project.id, { title: 'Third' });

    const snapshot = await boardSnapshot(owner, project.id);
    expect(snapshot.tasks.map((t) => t.title)).toEqual(['First', 'Second', 'Third']);
  });

  it('marks a card created straight into a Done column as resolved', async () => {
    const { owner, project, columns } = await setup();
    const done = columns.find((c) => c.category === 'DONE')!;
    const task = await createTask(owner, project.id, { title: 'Already finished', columnId: done.id });
    expect(task.resolvedAt).not.toBeNull();
  });

  it('accepts priority, due date, story points and labels', async () => {
    const { owner, project } = await setup();
    const label = await api().post(`/api/v1/projects/${project.id}/labels`)
      .set(auth(owner.accessToken)).send({ name: 'backend', color: '#0ea5e9' });

    const task = await createTask(owner, project.id, {
      title: 'Full detail card',
      priority: 'CRITICAL',
      dueDate: '2026-12-31',
      storyPoints: 8,
      type: 'BUG',
      labelIds: [label.body.label.id],
    });

    expect(task.labels).toHaveLength(1);
    const fetched = await api().get(`/api/v1/tasks/${task.id}`).set(auth(owner.accessToken));
    expect(fetched.body.task.priority).toBe('CRITICAL');
    expect(fetched.body.task.dueDate).toBe('2026-12-31');
    expect(fetched.body.task.storyPoints).toBe(8);
    expect(fetched.body.task.type).toBe('BUG');
  });

  it('refuses an assignee who is not on the project', async () => {
    const { owner, project } = await setup();
    const { account: outsider } = await memberOf(owner, 'MEMBER');

    const res = await api().post(`/api/v1/projects/${project.id}/tasks`)
      .set(auth(owner.accessToken)).send({ title: 'Wrong assignee', assigneeId: outsider.user.id });
    expect(res.status).toBe(400);
  });

  it('refuses a label from another project', async () => {
    const { owner, project } = await setup();
    const other = await createProject(owner, { name: 'Other Project', key: 'OTH' });
    const label = await api().post(`/api/v1/projects/${other.id}/labels`)
      .set(auth(owner.accessToken)).send({ name: 'foreign', color: '#ef4444' });

    const res = await api().post(`/api/v1/projects/${project.id}/tasks`)
      .set(auth(owner.accessToken)).send({ title: 'Borrowed label', labelIds: [label.body.label.id] });
    expect(res.status).toBe(400);
  });

  it('stops a viewer from creating anything', async () => {
    const { owner, project } = await setup();
    const { account: viewer, token } = await memberOf(owner, 'MEMBER');
    await addProjectMember(owner, project.id, viewer.user.id, 'VIEWER');

    const res = await api().post(`/api/v1/projects/${project.id}/tasks`).set(auth(token)).send({ title: 'Nope' });
    expect(res.status).toBe(403);
  });
});

describe('moving work items', () => {
  it('moves a card to another column and records the status', async () => {
    const { owner, project, columns } = await setup();
    const task = await createTask(owner, project.id, { title: 'Travelling card' });
    const inProgress = columns[1]!;

    const res = await api().post(`/api/v1/tasks/${task.id}/move`)
      .set(auth(owner.accessToken)).send({ columnId: inProgress.id, index: 0, version: task.version });

    expect(res.status).toBe(200);
    expect(res.body.task.columnId).toBe(inProgress.id);
    expect(res.body.fromColumnId).toBe(task.columnId);
    expect(res.body.task.version).toBe(2);
  });

  it('sets and clears resolution as a card crosses the Done boundary', async () => {
    const { owner, project, columns } = await setup();
    const task = await createTask(owner, project.id, { title: 'Round trip' });
    const done = columns.find((c) => c.category === 'DONE')!;

    const finished = await api().post(`/api/v1/tasks/${task.id}/move`)
      .set(auth(owner.accessToken)).send({ columnId: done.id, index: 0, version: task.version });
    expect(finished.body.task.resolvedAt).not.toBeNull();

    const reopened = await api().post(`/api/v1/tasks/${task.id}/move`)
      .set(auth(owner.accessToken)).send({ columnId: columns[0]!.id, index: 0, version: finished.body.task.version });
    expect(reopened.body.task.resolvedAt).toBeNull();
  });

  it('reorders within a column', async () => {
    const { owner, project, columns } = await setup();
    await createTask(owner, project.id, { title: 'Card A' });
    await createTask(owner, project.id, { title: 'Card B' });
    const c = await createTask(owner, project.id, { title: 'Card C' });

    await api().post(`/api/v1/tasks/${c.id}/move`)
      .set(auth(owner.accessToken)).send({ columnId: columns[0]!.id, index: 0, version: c.version });

    const snapshot = await boardSnapshot(owner, project.id);
    expect(snapshot.tasks.map((t) => t.title)).toEqual(['Card C', 'Card A', 'Card B']);
  });

  it('survives a hundred consecutive moves without losing order', async () => {
    const { owner, project, columns } = await setup();
    const titles = ['Card A', 'Card B', 'Card C', 'Card D', 'Card E'];
    for (const title of titles) await createTask(owner, project.id, { title });

    for (let i = 0; i < 100; i += 1) {
      const snapshot = await boardSnapshot(owner, project.id);
      const pick = snapshot.tasks[i % snapshot.tasks.length]!;
      await api().post(`/api/v1/tasks/${pick.id}/move`)
        .set(auth(owner.accessToken)).send({ columnId: columns[i % 2]!.id, index: i % 4, version: pick.version });
    }

    const snapshot = await boardSnapshot(owner, project.id);
    expect(snapshot.tasks).toHaveLength(5);
    expect(new Set(snapshot.tasks.map((t) => t.title))).toEqual(new Set(titles));
    const positions = snapshot.tasks.filter((t) => t.columnId === columns[0]!.id).map((t) => t.position);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('refuses a column from another project', async () => {
    const { owner, project } = await setup();
    const other = await createProject(owner, { name: 'Elsewhere', key: 'ELS' });
    const otherColumns = (await boardSnapshot(owner, other.id)).columns;
    const task = await createTask(owner, project.id, { title: 'Stay put' });

    const res = await api().post(`/api/v1/tasks/${task.id}/move`)
      .set(auth(owner.accessToken)).send({ columnId: otherColumns[0]!.id, index: 0, version: task.version });
    expect(res.status).toBe(400);
  });
});

describe('optimistic concurrency (FR-F-14)', () => {
  it('accepts a write that carries the current version', async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner, project.id, { title: 'Versioned' });

    const res = await api().patch(`/api/v1/tasks/${task.id}`)
      .set(auth(owner.accessToken)).send({ title: 'Versioned v2', version: task.version });
    expect(res.status).toBe(200);
    expect(res.body.task.version).toBe(2);
  });

  it('rejects a stale write and hands back the current state', async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner, project.id, { title: 'Contended' });

    await api().patch(`/api/v1/tasks/${task.id}`)
      .set(auth(owner.accessToken)).send({ title: 'Won the race', version: task.version });

    const stale = await api().patch(`/api/v1/tasks/${task.id}`)
      .set(auth(owner.accessToken)).send({ title: 'Lost the race', version: task.version });

    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect(stale.body.current.title).toBe('Won the race');
  });

  it('rejects an update with no version rather than force-writing it', async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner, project.id, { title: 'Forced' });
    await api().patch(`/api/v1/tasks/${task.id}`).set(auth(owner.accessToken)).send({ title: 'One', version: 1 });

    // Previously this was a deliberate force-write and returned 200. It also
    // back-filled every unspecified field from a stale snapshot, so forgetting
    // the field silently reverted a concurrent writer. Version is now required.
    const res = await api().patch(`/api/v1/tasks/${task.id}`).set(auth(owner.accessToken)).send({ title: 'Two' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d: { field: string }) => d.field === 'version')).toBe(true);

    // And the earlier value is intact — nothing was written.
    const after = await api().get(`/api/v1/tasks/${task.id}`).set(auth(owner.accessToken));
    expect(after.body.task.title).toBe('One');
  });

  it('rejects a move with no version', async () => {
    const { owner, project } = await setup();
    const board = await boardSnapshot(owner, project.id);
    const task = await createTask(owner, project.id, { title: 'Needs a version' });

    const res = await api()
      .post(`/api/v1/tasks/${task.id}/move`)
      .set(auth(owner.accessToken))
      .send({ columnId: board.columns[1]!.id, index: 0 });

    expect(res.status).toBe(400);
  });

  it('does not let a stale version overwrite newer data, and says what the current state is', async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner, project.id, { title: 'Original', priority: 'LOW' });

    // Writer A changes the priority.
    const first = await api()
      .patch(`/api/v1/tasks/${task.id}`)
      .set(auth(owner.accessToken))
      .send({ priority: 'CRITICAL', version: task.version });
    expect(first.status).toBe(200);

    // Writer B still holds the old version and edits only the title.
    const stale = await api()
      .patch(`/api/v1/tasks/${task.id}`)
      .set(auth(owner.accessToken))
      .send({ title: 'Stale write', version: task.version });

    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect(stale.body.current).toBeDefined();
    expect(stale.body.current.priority).toBe('CRITICAL');

    // The priority A set must survive — this is the silent reversion the
    // optional version allowed.
    const after = await api().get(`/api/v1/tasks/${task.id}`).set(auth(owner.accessToken));
    expect(after.body.task.priority).toBe('CRITICAL');
    expect(after.body.task.title).toBe('Original');
  });
});

describe('assignment and my work', () => {
  it('lists open work assigned to the caller, most urgent first', async () => {
    const { owner, project } = await setup();
    const { account: dev, token } = await memberOf(owner, 'MEMBER');
    await addProjectMember(owner, project.id, dev.user.id, 'DEVELOPER');

    await createTask(owner, project.id, { title: 'Low one', assigneeId: dev.user.id, priority: 'LOW' });
    await createTask(owner, project.id, { title: 'Critical one', assigneeId: dev.user.id, priority: 'CRITICAL' });
    await createTask(owner, project.id, { title: 'Not mine' });

    const res = await api().get('/api/v1/tasks/mine').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual(['Critical one', 'Low one']);
    expect(res.body.nextCursor).toBeNull();
  });

  it('drops a card off My Work once it is resolved', async () => {
    const { owner, project, columns } = await setup();
    const { account: dev, token } = await memberOf(owner, 'MEMBER');
    await addProjectMember(owner, project.id, dev.user.id, 'DEVELOPER');
    const task = await createTask(owner, project.id, { title: 'Finish me', assigneeId: dev.user.id });

    await api().post(`/api/v1/tasks/${task.id}/move`)
      .set(auth(owner.accessToken)).send({ columnId: columns.find((c) => c.category === 'DONE')!.id, index: 0, version: task.version });

    const res = await api().get('/api/v1/tasks/mine').set(auth(token));
    expect(res.body.data).toHaveLength(0);
  });

  it('tracks watchers', async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner, project.id, { title: 'Watched' });

    const watchers = await api().post(`/api/v1/tasks/${task.id}/watch`).set(auth(owner.accessToken));
    expect(watchers.body.watchers).toHaveLength(1);

    const removed = await api().delete(`/api/v1/tasks/${task.id}/watch`).set(auth(owner.accessToken));
    expect(removed.body.watchers).toHaveLength(0);
  });
});

describe('deleting work items', () => {
  it('lets a developer delete their own card but not someone else’s', async () => {
    const { owner, project } = await setup();
    const { account: dev, token } = await memberOf(owner, 'MEMBER');
    await addProjectMember(owner, project.id, dev.user.id, 'DEVELOPER');

    const ownCard = await createTask({ accessToken: token }, project.id, { title: 'Mine' });
    const othersCard = await createTask(owner, project.id, { title: 'Not mine' });

    expect((await api().delete(`/api/v1/tasks/${ownCard.id}`).set(auth(token))).status).toBe(200);
    expect((await api().delete(`/api/v1/tasks/${othersCard.id}`).set(auth(token))).status).toBe(403);
  });

  it('lets a project manager delete anything', async () => {
    const { owner, project } = await setup();
    const { account: dev, token } = await memberOf(owner, 'MEMBER');
    await addProjectMember(owner, project.id, dev.user.id, 'DEVELOPER');
    const card = await createTask({ accessToken: token }, project.id, { title: 'Someone else’s' });

    expect((await api().delete(`/api/v1/tasks/${card.id}`).set(auth(owner.accessToken))).status).toBe(200);
  });
});
