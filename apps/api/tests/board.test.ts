import { describe, expect, it } from 'vitest';
import { api } from './helpers/app.js';
import { auth, boardSnapshot, createProject, createTask, memberOf, registerAccount, addProjectMember } from './helpers/factories.js';

describe('board provisioning (FR-D-02)', () => {
  it('gives a new project the four default columns in order', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const snapshot = await boardSnapshot(owner, project.id);

    expect(snapshot.columns.map((c) => c.name)).toEqual(['Backlog', 'In Progress', 'Code Review', 'Done']);
    expect(snapshot.columns.map((c) => c.category)).toEqual(['TODO', 'IN_PROGRESS', 'IN_PROGRESS', 'DONE']);
    expect(snapshot.statuses).toHaveLength(4);
    expect(snapshot.tasks).toEqual([]);
  });

  it('returns everything the board view needs in one call', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const res = await api().get(`/api/v1/projects/${project.id}/board`).set(auth(owner.accessToken));

    expect(res.status).toBe(200);
    for (const key of ['project', 'board', 'boards', 'statuses', 'columns', 'tasks', 'labels', 'members', 'permissions']) {
      expect(res.body).toHaveProperty(key);
    }
    expect(res.body.members).toHaveLength(1);
    expect(res.body.permissions).toContain('task.create');
  });
});

describe('column configuration', () => {
  it('adds a column and its backing status', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);

    const res = await api().post(`/api/v1/projects/${project.id}/columns`)
      .set(auth(owner.accessToken)).send({ name: 'Blocked', category: 'IN_PROGRESS' });

    expect(res.status).toBe(201);
    expect(res.body.column.name).toBe('Blocked');

    const snapshot = await boardSnapshot(owner, project.id);
    expect(snapshot.columns.map((c) => c.name)).toEqual(['Backlog', 'In Progress', 'Code Review', 'Done', 'Blocked']);
    expect(snapshot.statuses).toHaveLength(5);
  });

  it('refuses a duplicate status name', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const res = await api().post(`/api/v1/projects/${project.id}/columns`)
      .set(auth(owner.accessToken)).send({ name: 'Done', category: 'DONE' });
    expect(res.status).toBe(409);
  });

  it('renames a column and its status together', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const snapshot = await boardSnapshot(owner, project.id);
    const review = snapshot.columns.find((c) => c.name === 'Code Review')!;

    const res = await api().patch(`/api/v1/columns/${review.id}`)
      .set(auth(owner.accessToken)).send({ name: 'Peer Review' });
    expect(res.status).toBe(200);

    const after = await boardSnapshot(owner, project.id);
    expect(after.columns.find((c) => c.id === review.id)!.name).toBe('Peer Review');
    expect(after.statuses.some((s) => s.name === 'Peer Review')).toBe(true);
    expect(after.statuses.some((s) => s.name === 'Code Review')).toBe(false);
  });

  it('reorders columns', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const snapshot = await boardSnapshot(owner, project.id);
    const reversed = [...snapshot.columns].reverse().map((c) => c.id);

    const res = await api().patch(`/api/v1/projects/${project.id}/columns/reorder`)
      .set(auth(owner.accessToken)).send({ orderedColumnIds: reversed });

    expect(res.status).toBe(200);
    expect(res.body.columns.map((c: { name: string }) => c.name)).toEqual(['Done', 'Code Review', 'In Progress', 'Backlog']);
  });

  it('rejects a partial reorder', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const snapshot = await boardSnapshot(owner, project.id);

    const res = await api().patch(`/api/v1/projects/${project.id}/columns/reorder`)
      .set(auth(owner.accessToken)).send({ orderedColumnIds: [snapshot.columns[0]!.id] });
    expect(res.status).toBe(400);
  });

  it('refuses to delete a column that still holds cards, then moves them when told where', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const snapshot = await boardSnapshot(owner, project.id);
    const backlog = snapshot.columns[0]!;
    const todo = snapshot.columns[1]!;
    await createTask(owner, project.id, { title: 'Card that must not vanish' });

    const refused = await api().delete(`/api/v1/columns/${backlog.id}`).set(auth(owner.accessToken));
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toContain('choose a column');

    const moved = await api().delete(`/api/v1/columns/${backlog.id}?moveTo=${todo.id}`).set(auth(owner.accessToken));
    expect(moved.status).toBe(200);
    expect(moved.body.movedTasksTo).toBe(todo.id);

    const after = await boardSnapshot(owner, project.id);
    expect(after.columns).toHaveLength(3);
    expect(after.tasks).toHaveLength(1);
    expect(after.tasks[0]!.columnId).toBe(todo.id);
  });

  it('deletes an empty column without ceremony', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const snapshot = await boardSnapshot(owner, project.id);

    const res = await api().delete(`/api/v1/columns/${snapshot.columns[2]!.id}`).set(auth(owner.accessToken));
    expect(res.status).toBe(200);
    expect((await boardSnapshot(owner, project.id)).columns).toHaveLength(3);
  });

  it('stops a developer from reconfiguring the board', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const { account: dev, token } = await memberOf(owner, 'MEMBER');
    await addProjectMember(owner, project.id, dev.user.id, 'DEVELOPER');

    const res = await api().post(`/api/v1/projects/${project.id}/columns`)
      .set(auth(token)).send({ name: 'Dev Column', category: 'TODO' });
    expect(res.status).toBe(403);
  });
});

describe('labels', () => {
  it('creates, lists and deletes labels', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);

    const created = await api().post(`/api/v1/projects/${project.id}/labels`)
      .set(auth(owner.accessToken)).send({ name: 'backend', color: '#0ea5e9' });
    expect(created.status).toBe(201);

    const listed = await api().get(`/api/v1/projects/${project.id}/labels`).set(auth(owner.accessToken));
    expect(listed.body.labels).toHaveLength(1);

    const removed = await api().delete(`/api/v1/projects/${project.id}/labels/${created.body.label.id}`)
      .set(auth(owner.accessToken));
    expect(removed.status).toBe(200);
    expect((await api().get(`/api/v1/projects/${project.id}/labels`).set(auth(owner.accessToken))).body.labels).toHaveLength(0);
  });

  it('refuses a duplicate label name', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    await api().post(`/api/v1/projects/${project.id}/labels`).set(auth(owner.accessToken)).send({ name: 'bug', color: '#ef4444' });
    const res = await api().post(`/api/v1/projects/${project.id}/labels`).set(auth(owner.accessToken)).send({ name: 'BUG', color: '#ef4444' });
    expect(res.status).toBe(409);
  });
});

describe('multiple boards', () => {
  it('mirrors the project workflow onto a new board', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);

    const created = await api().post(`/api/v1/projects/${project.id}/boards`)
      .set(auth(owner.accessToken)).send({ name: 'Sprint Board' });
    expect(created.status).toBe(201);
    expect(created.body.board.isDefault).toBe(false);

    const columns = await api().get(`/api/v1/projects/${project.id}/columns?boardId=${created.body.board.id}`)
      .set(auth(owner.accessToken));
    expect(columns.body.columns.map((c: { name: string }) => c.name))
      .toEqual(['Backlog', 'In Progress', 'Code Review', 'Done']);
  });
});
