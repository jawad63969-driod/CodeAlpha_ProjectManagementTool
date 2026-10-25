import { describe, expect, it } from 'vitest';
import { api } from './helpers/app.js';
import { addProjectMember, auth, boardSnapshot, createProject, createTask, memberOf, registerAccount } from './helpers/factories.js';

const setup = async () => {
  const owner = await registerAccount({ name: 'Ayesha Siddiqui' });
  const project = await createProject(owner, { name: 'Collaboration Lab', key: 'COL' });
  const { account: dev, token: devToken } = await memberOf(owner, 'MEMBER', 'Bilal Ahmed');
  await addProjectMember(owner, project.id, dev.user.id, 'DEVELOPER');
  const task = await createTask(owner, project.id, { title: 'Discussable card' });
  return { owner, dev, devToken, project, task };
};

describe('threaded comments (FR-H)', () => {
  it('posts a comment and returns its author', async () => {
    const { owner, task } = await setup();
    const res = await api().post(`/api/v1/tasks/${task.id}/comments`)
      .set(auth(owner.accessToken)).send({ body: 'This needs a second pair of eyes.' });

    expect(res.status).toBe(201);
    expect(res.body.comment.author.name).toBe('Ayesha Siddiqui');
    expect(res.body.comment.parentCommentId).toBeNull();
    expect(res.body.comment.editedAt).toBeNull();
  });

  it('rejects an empty comment', async () => {
    const { owner, task } = await setup();
    const res = await api().post(`/api/v1/tasks/${task.id}/comments`)
      .set(auth(owner.accessToken)).send({ body: '   ' });
    expect(res.status).toBe(400);
  });

  it('threads a reply under its root', async () => {
    const { owner, devToken, task } = await setup();
    const root = await api().post(`/api/v1/tasks/${task.id}/comments`)
      .set(auth(owner.accessToken)).send({ body: 'Root comment' });

    const reply = await api().post(`/api/v1/tasks/${task.id}/comments`)
      .set(auth(devToken)).send({ body: 'A reply', parentCommentId: root.body.comment.id });

    expect(reply.status).toBe(201);
    expect(reply.body.comment.parentCommentId).toBe(root.body.comment.id);
  });

  it('flattens a reply-to-a-reply onto the root rather than failing', async () => {
    const { owner, devToken, task } = await setup();
    const root = await api().post(`/api/v1/tasks/${task.id}/comments`)
      .set(auth(owner.accessToken)).send({ body: 'Root comment' });
    const reply = await api().post(`/api/v1/tasks/${task.id}/comments`)
      .set(auth(devToken)).send({ body: 'First reply', parentCommentId: root.body.comment.id });

    const nested = await api().post(`/api/v1/tasks/${task.id}/comments`)
      .set(auth(owner.accessToken)).send({ body: 'Reply to the reply', parentCommentId: reply.body.comment.id });

    expect(nested.status).toBe(201);
    expect(nested.body.comment.parentCommentId).toBe(root.body.comment.id);
  });

  it('refuses a parent comment from another task', async () => {
    const { owner, project, task } = await setup();
    const other = await createTask(owner, project.id, { title: 'Different card' });
    const elsewhere = await api().post(`/api/v1/tasks/${other.id}/comments`)
      .set(auth(owner.accessToken)).send({ body: 'Elsewhere' });

    const res = await api().post(`/api/v1/tasks/${task.id}/comments`)
      .set(auth(owner.accessToken)).send({ body: 'Wrong thread', parentCommentId: elsewhere.body.comment.id });
    expect(res.status).toBe(400);
  });

  it('lets an author edit their own comment and marks it edited', async () => {
    const { owner, task } = await setup();
    const created = await api().post(`/api/v1/tasks/${task.id}/comments`)
      .set(auth(owner.accessToken)).send({ body: 'Original text' });

    const edited = await api().patch(`/api/v1/comments/${created.body.comment.id}`)
      .set(auth(owner.accessToken)).send({ body: 'Corrected text' });

    expect(edited.status).toBe(200);
    expect(edited.body.comment.body).toBe('Corrected text');
    expect(edited.body.comment.editedAt).not.toBeNull();
  });

  it('stops anyone editing someone else’s comment', async () => {
    const { owner, devToken, task } = await setup();
    const created = await api().post(`/api/v1/tasks/${task.id}/comments`)
      .set(auth(owner.accessToken)).send({ body: 'Mine' });

    const res = await api().patch(`/api/v1/comments/${created.body.comment.id}`)
      .set(auth(devToken)).send({ body: 'Hijacked' });
    expect(res.status).toBe(403);
  });

  it('lets a project manager delete anyone’s comment, but a developer only their own', async () => {
    const { owner, devToken, task } = await setup();
    const ownersComment = await api().post(`/api/v1/tasks/${task.id}/comments`)
      .set(auth(owner.accessToken)).send({ body: 'From the manager' });
    const devsComment = await api().post(`/api/v1/tasks/${task.id}/comments`)
      .set(auth(devToken)).send({ body: 'From the developer' });

    expect((await api().delete(`/api/v1/comments/${ownersComment.body.comment.id}`).set(auth(devToken))).status).toBe(403);
    expect((await api().delete(`/api/v1/comments/${devsComment.body.comment.id}`).set(auth(devToken))).status).toBe(200);
    expect((await api().delete(`/api/v1/comments/${ownersComment.body.comment.id}`).set(auth(owner.accessToken))).status).toBe(200);
  });

  it('removes replies along with their root', async () => {
    const { owner, task } = await setup();
    const root = await api().post(`/api/v1/tasks/${task.id}/comments`)
      .set(auth(owner.accessToken)).send({ body: 'Root comment' });
    await api().post(`/api/v1/tasks/${task.id}/comments`)
      .set(auth(owner.accessToken)).send({ body: 'A reply', parentCommentId: root.body.comment.id });

    await api().delete(`/api/v1/comments/${root.body.comment.id}`).set(auth(owner.accessToken));
    const listed = await api().get(`/api/v1/tasks/${task.id}/comments`).set(auth(owner.accessToken));
    expect(listed.body.comments).toHaveLength(0);
  });

  it('counts comments on the task', async () => {
    const { owner, task } = await setup();
    await api().post(`/api/v1/tasks/${task.id}/comments`).set(auth(owner.accessToken)).send({ body: 'One' });
    await api().post(`/api/v1/tasks/${task.id}/comments`).set(auth(owner.accessToken)).send({ body: 'Two' });

    const res = await api().get(`/api/v1/tasks/${task.id}`).set(auth(owner.accessToken));
    expect(res.body.task.commentCount).toBe(2);
  });

  it('stops a viewer from commenting', async () => {
    const { owner, project, task } = await setup();
    const { account: viewer, token } = await memberOf(owner, 'MEMBER');
    await addProjectMember(owner, project.id, viewer.user.id, 'VIEWER');

    const res = await api().post(`/api/v1/tasks/${task.id}/comments`).set(auth(token)).send({ body: 'Read only' });
    expect(res.status).toBe(403);
  });
});

describe('mentions (FR-H-04)', () => {
  it('resolves an @first-name to a project member and notifies them', async () => {
    const { owner, dev, devToken, task } = await setup();
    const res = await api().post(`/api/v1/tasks/${task.id}/comments`)
      .set(auth(owner.accessToken)).send({ body: 'Can you take a look @bilal?' });

    expect(res.status).toBe(201);
    expect(res.body.comment.mentions).toHaveLength(1);
    expect(res.body.comment.mentions[0].id).toBe(dev.user.id);

    const feed = await api().get('/api/v1/notifications').set(auth(devToken));
    expect(feed.body.data.some((n: { type: string }) => n.type === 'MENTIONED')).toBe(true);
  });

  it('ignores an @handle that matches nobody on the project', async () => {
    const { owner, task } = await setup();
    const res = await api().post(`/api/v1/tasks/${task.id}/comments`)
      .set(auth(owner.accessToken)).send({ body: 'Hello @nobody_at_all' });
    expect(res.body.comment.mentions).toHaveLength(0);
  });

  it('re-resolves mentions when a comment is edited', async () => {
    const { owner, dev, task } = await setup();
    const created = await api().post(`/api/v1/tasks/${task.id}/comments`)
      .set(auth(owner.accessToken)).send({ body: 'No mentions here' });
    expect(created.body.comment.mentions).toHaveLength(0);

    const edited = await api().patch(`/api/v1/comments/${created.body.comment.id}`)
      .set(auth(owner.accessToken)).send({ body: 'Actually @bilal should see this' });
    expect(edited.body.comment.mentions[0].id).toBe(dev.user.id);
  });

  it('notifies the task watchers when someone comments', async () => {
    const { owner, dev, devToken, project } = await setup();
    const assigned = await createTask(owner, project.id, { title: 'Assigned card', assigneeId: dev.user.id });

    await api().post(`/api/v1/tasks/${assigned.id}/comments`)
      .set(auth(owner.accessToken)).send({ body: 'Progress update' });

    const feed = await api().get('/api/v1/notifications').set(auth(devToken));
    expect(feed.body.data.some((n: { type: string }) => n.type === 'COMMENT_CREATED')).toBe(true);
  });
});

describe('activity trail (FR-I-01 … FR-I-04)', () => {
  it('records every mutation against the project', async () => {
    const { owner, project, task } = await setup();
    const columns = (await boardSnapshot(owner, project.id)).columns;

    const moved = await api().post(`/api/v1/tasks/${task.id}/move`)
      .set(auth(owner.accessToken)).send({ columnId: columns[1]!.id, index: 0, version: task.version });
    await api().patch(`/api/v1/tasks/${task.id}`)
      .set(auth(owner.accessToken)).send({ title: 'Renamed card', version: moved.body.task.version });

    const res = await api().get(`/api/v1/projects/${project.id}/activity`).set(auth(owner.accessToken));
    expect(res.status).toBe(200);

    const actions = res.body.data.map((a: { action: string }) => a.action);
    expect(actions).toContain('created');
    expect(actions).toContain('moved');
    expect(actions).toContain('updated');
    expect(res.body.data[0].actor.name).toBe('Ayesha Siddiqui');
  });

  it('records what changed, from and to', async () => {
    const { owner, project, task } = await setup();
    await api().patch(`/api/v1/tasks/${task.id}`)
      .set(auth(owner.accessToken)).send({ priority: 'CRITICAL', version: task.version });

    const res = await api().get(`/api/v1/tasks/${task.id}/activity`).set(auth(owner.accessToken));
    const update = res.body.data.find((a: { action: string }) => a.action === 'updated');
    expect(update.changes.priority).toEqual({ from: 'MEDIUM', to: 'CRITICAL' });
  });

  it('interleaves comments into a task timeline', async () => {
    const { owner, task } = await setup();
    await api().post(`/api/v1/tasks/${task.id}/comments`).set(auth(owner.accessToken)).send({ body: 'A remark' });

    const res = await api().get(`/api/v1/tasks/${task.id}/activity`).set(auth(owner.accessToken));
    const types = res.body.data.map((a: { entityType: string }) => a.entityType);
    expect(types).toContain('TASK');
    expect(types).toContain('COMMENT');
  });

  it('outlives the row it describes', async () => {
    const { owner, project, task } = await setup();
    await api().delete(`/api/v1/tasks/${task.id}`).set(auth(owner.accessToken));

    const res = await api().get(`/api/v1/projects/${project.id}/activity`).set(auth(owner.accessToken));
    const deletion = res.body.data.find((a: { action: string }) => a.action === 'deleted');
    expect(deletion).toBeTruthy();
    expect(deletion.changes.title.from).toBe('Discussable card');
  });

  it('gives workspace admins a cross-project feed and refuses plain members', async () => {
    const { owner } = await setup();
    const { token: memberToken } = await memberOf(owner, 'MEMBER');

    expect((await api().get('/api/v1/activity').set(auth(owner.accessToken))).status).toBe(200);
    expect((await api().get('/api/v1/activity').set(auth(memberToken))).status).toBe(403);
  });

  it('paginates with a cursor', async () => {
    const { owner, project } = await setup();
    for (let i = 0; i < 6; i += 1) await createTask(owner, project.id, { title: `Card ${i}` });

    const first = await api().get(`/api/v1/projects/${project.id}/activity?limit=3`).set(auth(owner.accessToken));
    expect(first.body.data).toHaveLength(3);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await api()
      .get(`/api/v1/projects/${project.id}/activity?limit=3&cursor=${first.body.nextCursor}`)
      .set(auth(owner.accessToken));
    const overlap = second.body.data.filter((a: { id: string }) =>
      first.body.data.some((b: { id: string }) => b.id === a.id));
    expect(overlap).toHaveLength(0);
  });
});
