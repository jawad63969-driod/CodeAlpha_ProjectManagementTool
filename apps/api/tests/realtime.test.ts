import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api } from './helpers/app.js';
import { addProjectMember, auth, boardSnapshot, createProject, createTask, memberOf, registerAccount } from './helpers/factories.js';
import { TestClient, settle, startLiveServer, type LiveServer } from './helpers/realtime.js';

let server: LiveServer;
beforeAll(async () => { server = await startLiveServer(); });
afterAll(async () => { await server.close(); });

/** An owner plus a developer on the same project, both with live sockets. */
const pair = async () => {
  const owner = await registerAccount();
  const project = await createProject(owner, { name: 'Realtime Lab', key: 'RTL' });
  const { account: dev, token: devToken } = await memberOf(owner, 'MEMBER', 'Dev Watcher');
  await addProjectMember(owner, project.id, dev.user.id, 'DEVELOPER');

  const columns = (await boardSnapshot(owner, project.id)).columns;
  const ownerClient = await TestClient.connect(server.url, owner.accessToken);
  const devClient = await TestClient.connect(server.url, devToken);
  await ownerClient.subscribe(project.id);
  await devClient.subscribe(project.id);
  devClient.clear();
  ownerClient.clear();

  return { owner, dev, devToken, project, columns, ownerClient, devClient };
};

describe('gateway authentication (FR-J-01)', () => {
  it('accepts a valid access token', async () => {
    const account = await registerAccount();
    const client = await TestClient.connect(server.url, account.accessToken);
    expect(client.socket.connected).toBe(true);
    client.close();
  });

  it('refuses a missing token', async () => {
    await expect(TestClient.connect(server.url, '')).rejects.toThrow();
  });

  it('refuses a forged token', async () => {
    await expect(TestClient.connect(server.url, 'not.a.real.token')).rejects.toThrow();
  });

  it('refuses a token signed with the wrong secret', async () => {
    const jwt = await import('jsonwebtoken');
    const forged = jwt.default.sign({ org: 'org_fake', sid: 'x' }, 'z'.repeat(40), { subject: 'usr_fake' });
    await expect(TestClient.connect(server.url, forged)).rejects.toThrow();
  });
});

describe('subscription authorization (FR-J-02)', () => {
  it('lets a project member subscribe', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const client = await TestClient.connect(server.url, owner.accessToken);

    const ack = await client.subscribe(project.id);
    expect(ack.ok).toBe(true);
    expect(ack.viewers).toHaveLength(1);
    client.close();
  });

  it('refuses a workspace member who is not on the project', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const { token } = await memberOf(owner, 'MEMBER');
    const client = await TestClient.connect(server.url, token);

    const ack = await client.subscribe(project.id);
    expect(ack.ok).toBe(false);
    client.close();
  });

  it('refuses a project in another tenant', async () => {
    const acme = await registerAccount({ organizationName: 'Acme' });
    const project = await createProject(acme);
    const outsider = await registerAccount();
    const client = await TestClient.connect(server.url, outsider.accessToken);

    const ack = await client.subscribe(project.id);
    expect(ack.ok).toBe(false);
    client.close();
  });

  it('sends nothing to a socket that never subscribed', async () => {
    const { owner, project, ownerClient } = await pair();
    const lurker = await TestClient.connect(server.url, owner.accessToken); // connected, not subscribed

    await createTask(owner, project.id, { title: 'Silent for the lurker' });
    await ownerClient.waitFor('task.created');
    await settle();

    expect(lurker.seen('task.created')).toBe(false);
    lurker.close();
    ownerClient.close();
  });
});

describe('live board updates (FR-J-03)', () => {
  it('broadcasts a new card to everyone watching the board', async () => {
    const { owner, project, ownerClient, devClient } = await pair();
    const task = await createTask(owner, project.id, { title: 'Appears everywhere' });

    const event = await devClient.waitFor('task.created');
    expect(event.payload.task.id).toBe(task.id);
    expect(event.payload.task.title).toBe('Appears everywhere');
    expect(event.actorId).toBe(owner.user.id);
    expect(event.projectId).toBe(project.id);
    expect(event.version).toBe(1);

    ownerClient.close();
    devClient.close();
  });

  it('broadcasts a move with both ends of the journey', async () => {
    const { owner, project, columns, ownerClient, devClient } = await pair();
    const task = await createTask(owner, project.id, { title: 'Travelling card' });
    devClient.clear();

    await api().post(`/api/v1/tasks/${task.id}/move`)
      .set(auth(owner.accessToken)).send({ columnId: columns[1]!.id, index: 0, version: task.version });

    const event = await devClient.waitFor('task.moved');
    expect(event.payload.fromColumnId).toBe(columns[0]!.id);
    expect(event.payload.toColumnId).toBe(columns[1]!.id);

    ownerClient.close();
    devClient.close();
  });

  it('broadcasts updates, deletes and column changes', async () => {
    const { owner, project, ownerClient, devClient } = await pair();
    const task = await createTask(owner, project.id, { title: 'Busy card' });
    devClient.clear();

    await api().patch(`/api/v1/tasks/${task.id}`)
      .set(auth(owner.accessToken)).send({ title: 'Renamed card', version: task.version });
    expect((await devClient.waitFor('task.updated')).payload.task.title).toBe('Renamed card');

    await api().post(`/api/v1/projects/${project.id}/columns`)
      .set(auth(owner.accessToken)).send({ name: 'Blocked', category: 'IN_PROGRESS' });
    expect((await devClient.waitFor('column.created')).payload.column.name).toBe('Blocked');

    await api().delete(`/api/v1/tasks/${task.id}`).set(auth(owner.accessToken));
    expect((await devClient.waitFor('task.deleted')).payload.taskId).toBe(task.id);

    ownerClient.close();
    devClient.close();
  });

  it('carries the actor so a client can ignore its own echo (FR-J-04)', async () => {
    const { owner, project, ownerClient, devClient } = await pair();
    await createTask(owner, project.id, { title: 'Self echo' });

    const mine = await ownerClient.waitFor('task.created');
    expect(mine.actorId).toBe(owner.user.id); // the client discards this one

    const theirs = await devClient.waitFor('task.created');
    expect(theirs.actorId).toBe(owner.user.id); // and this one is applied

    ownerClient.close();
    devClient.close();
  });

  it('delivers within 300 ms locally', async () => {
    const { owner, project, ownerClient, devClient } = await pair();
    const started = Date.now();
    await createTask(owner, project.id, { title: 'Speed check' });
    await devClient.waitFor('task.created');

    expect(Date.now() - started).toBeLessThan(300);
    ownerClient.close();
    devClient.close();
  });
});

describe('presence (FR-J-05)', () => {
  it('announces viewers joining and leaving', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const { account: dev, token: devToken } = await memberOf(owner, 'MEMBER');
    await addProjectMember(owner, project.id, dev.user.id, 'DEVELOPER');

    const ownerClient = await TestClient.connect(server.url, owner.accessToken);
    await ownerClient.subscribe(project.id);
    ownerClient.clear();

    const devClient = await TestClient.connect(server.url, devToken);
    await devClient.subscribe(project.id);

    const joined = await ownerClient.waitFor('presence.updated');
    expect(joined.payload.viewers.map((v) => v.id).sort()).toEqual([owner.user.id, dev.user.id].sort());

    ownerClient.clear();
    devClient.close();
    const left = await ownerClient.waitFor('presence.updated');
    expect(left.payload.viewers.map((v) => v.id)).toEqual([owner.user.id]);

    ownerClient.close();
  });
});

describe('live notifications (FR-I-05, FR-I-06)', () => {
  it('pushes an assignment to the assignee’s personal room', async () => {
    const { owner, dev, project, ownerClient, devClient } = await pair();

    await createTask(owner, project.id, { title: 'Please pick this up', assigneeId: dev.user.id });

    const event = await devClient.waitFor('notification.created');
    expect(event.payload.notification.type).toBe('TASK_ASSIGNED');
    expect(event.payload.notification.actor?.id).toBe(owner.user.id);

    // The person who caused it is never notified about it.
    await settle();
    expect(ownerClient.seen('notification.created')).toBe(false);

    ownerClient.close();
    devClient.close();
  });

  it('notifies watchers when a card moves', async () => {
    const { owner, dev, project, columns, devClient, ownerClient } = await pair();
    const task = await createTask(owner, project.id, { title: 'Watched card', assigneeId: dev.user.id });
    devClient.clear();

    await api().post(`/api/v1/tasks/${task.id}/move`)
      .set(auth(owner.accessToken)).send({ columnId: columns[1]!.id, index: 0, version: task.version });

    const event = await devClient.waitFor('notification.created');
    expect(event.payload.notification.type).toBe('TASK_MOVED');

    ownerClient.close();
    devClient.close();
  });

  it('keeps an unread count and clears it', async () => {
    const { owner, dev, devToken, project, ownerClient, devClient } = await pair();
    await createTask(owner, project.id, { title: 'First', assigneeId: dev.user.id });
    await createTask(owner, project.id, { title: 'Second', assigneeId: dev.user.id });
    await settle(300);

    const feed = await api().get('/api/v1/notifications').set(auth(devToken));
    expect(feed.body.unread).toBe(2);
    expect(feed.body.data).toHaveLength(2);

    const one = await api().patch(`/api/v1/notifications/${feed.body.data[0].id}/read`).set(auth(devToken));
    expect(one.body.unread).toBe(1);

    const all = await api().post('/api/v1/notifications/read-all').set(auth(devToken));
    expect(all.body.unread).toBe(0);

    ownerClient.close();
    devClient.close();
  });
});
