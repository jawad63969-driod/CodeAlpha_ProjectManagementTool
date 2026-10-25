import { describe, expect, it } from 'vitest';
import { api } from './helpers/app.js';
import { auth, boardSnapshot, createProject, createTask, registerAccount } from './helpers/factories.js';

const setup = async () => {
  const owner = await registerAccount();
  const project = await createProject(owner, { name: 'Hierarchy Lab', key: 'HIER' });
  const columns = (await boardSnapshot(owner, project.id)).columns;
  return { owner, project, columns };
};

const child = (owner: { accessToken: string }, projectId: string, parentTaskId: string, title: string) =>
  createTask(owner, projectId, { title, parentTaskId });

describe('subtask hierarchy (FR-F-05 … FR-F-08)', () => {
  it('nests a subtask under its parent', async () => {
    const { owner, project } = await setup();
    const epic = await createTask(owner, project.id, { title: 'Authentication epic', type: 'EPIC' });
    const story = await child(owner, project.id, epic.id, 'Refresh token rotation');

    expect(story.depth).toBe(1);
    expect(story.parentTaskId).toBe(epic.id);
    // A card created under a parent becomes a subtask unless it says otherwise.
    const fetched = await api().get(`/api/v1/tasks/${story.id}`).set(auth(owner.accessToken));
    expect(fetched.body.task.type).toBe('SUBTASK');
  });

  it('keeps an explicit type when nesting', async () => {
    const { owner, project } = await setup();
    const epic = await createTask(owner, project.id, { title: 'Parent epic', type: 'EPIC' });
    const story = await createTask(owner, project.id, { title: 'A real story', parentTaskId: epic.id, type: 'STORY' });
    expect(story.depth).toBe(1);
    const fetched = await api().get(`/api/v1/tasks/${story.id}`).set(auth(owner.accessToken));
    expect(fetched.body.task.type).toBe('STORY');
  });

  it('allows five levels and refuses a sixth', async () => {
    const { owner, project } = await setup();
    let current = await createTask(owner, project.id, { title: 'Level zero' });
    for (let depth = 1; depth <= 4; depth += 1) {
      current = await child(owner, project.id, current.id, `Level ${depth}`);
      expect(current.depth).toBe(depth);
    }

    const tooDeep = await api().post(`/api/v1/projects/${project.id}/tasks`)
      .set(auth(owner.accessToken)).send({ title: 'Level five', parentTaskId: current.id });
    expect(tooDeep.status).toBe(422);
    expect(tooDeep.body.error.message).toContain('levels deep');
  });

  it('lists direct children', async () => {
    const { owner, project } = await setup();
    const parent = await createTask(owner, project.id, { title: 'Parent card' });
    await child(owner, project.id, parent.id, 'Child one');
    await child(owner, project.id, parent.id, 'Child two');

    const res = await api().get(`/api/v1/tasks/${parent.id}/subtasks`).set(auth(owner.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual(['Child one', 'Child two']);
  });

  it('aggregates subtask progress without a second round trip', async () => {
    const { owner, project, columns } = await setup();
    const parent = await createTask(owner, project.id, { title: 'Parent card' });
    const one = await child(owner, project.id, parent.id, 'Child one');
    await child(owner, project.id, parent.id, 'Child two');

    await api().post(`/api/v1/tasks/${one.id}/move`)
      .set(auth(owner.accessToken)).send({ columnId: columns.find((c) => c.category === 'DONE')!.id, index: 0, version: one.version });

    const res = await api().get(`/api/v1/tasks/${parent.id}`).set(auth(owner.accessToken));
    expect(res.body.task.subtaskCount).toBe(2);
    expect(res.body.task.subtaskDoneCount).toBe(1);
  });
});

describe('cycle prevention (FR-F-06)', () => {
  it('refuses to make a task its own parent', async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner, project.id, { title: 'Self referential' });

    const res = await api().patch(`/api/v1/tasks/${task.id}`)
      .set(auth(owner.accessToken)).send({ parentTaskId: task.id, version: task.version });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('its own parent');
  });

  it('refuses to move a task under its own child', async () => {
    const { owner, project } = await setup();
    const parent = await createTask(owner, project.id, { title: 'The parent' });
    const kid = await child(owner, project.id, parent.id, 'The child');

    const res = await api().patch(`/api/v1/tasks/${parent.id}`)
      .set(auth(owner.accessToken)).send({ parentTaskId: kid.id, version: parent.version });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('own subtree');
  });

  it('refuses to move a task under a distant descendant', async () => {
    const { owner, project } = await setup();
    const root = await createTask(owner, project.id, { title: 'Root card' });
    const mid = await child(owner, project.id, root.id, 'Middle card');
    const leaf = await child(owner, project.id, mid.id, 'Leaf card');

    const res = await api().patch(`/api/v1/tasks/${root.id}`)
      .set(auth(owner.accessToken)).send({ parentTaskId: leaf.id, version: root.version });
    expect(res.status).toBe(422);
  });
});

describe('re-parenting', () => {
  it('moves a whole subtree and fixes every descendant depth', async () => {
    const { owner, project } = await setup();
    const alpha = await createTask(owner, project.id, { title: 'Alpha epic' });
    const beta = await createTask(owner, project.id, { title: 'Beta epic' });
    const story = await child(owner, project.id, alpha.id, 'Story under alpha');
    const leaf = await child(owner, project.id, story.id, 'Leaf under story');

    const res = await api().patch(`/api/v1/tasks/${story.id}`)
      .set(auth(owner.accessToken)).send({ parentTaskId: beta.id, version: story.version });
    expect(res.status).toBe(200);
    expect(res.body.task.parentTaskId).toBe(beta.id);
    expect(res.body.task.depth).toBe(1);

    // The descendant travelled with it and kept its relative depth.
    const movedLeaf = await api().get(`/api/v1/tasks/${leaf.id}`).set(auth(owner.accessToken));
    expect(movedLeaf.body.task.depth).toBe(2);
    expect(movedLeaf.body.task.parentTaskId).toBe(story.id);

    expect((await api().get(`/api/v1/tasks/${alpha.id}`).set(auth(owner.accessToken))).body.task.subtaskCount).toBe(0);
    expect((await api().get(`/api/v1/tasks/${beta.id}`).set(auth(owner.accessToken))).body.task.subtaskCount).toBe(1);
  });

  it('promotes a subtask to the top level', async () => {
    const { owner, project } = await setup();
    const parent = await createTask(owner, project.id, { title: 'Parent card' });
    const kid = await child(owner, project.id, parent.id, 'Child card');

    const res = await api().patch(`/api/v1/tasks/${kid.id}`)
      .set(auth(owner.accessToken)).send({ parentTaskId: null, version: kid.version });
    expect(res.status).toBe(200);
    expect(res.body.task.parentTaskId).toBeNull();
    expect(res.body.task.depth).toBe(0);
  });

  it('refuses a re-parent that would push descendants past the depth cap', async () => {
    const { owner, project } = await setup();
    // A two-level subtree…
    const root = await createTask(owner, project.id, { title: 'Subtree root' });
    const mid = await child(owner, project.id, root.id, 'Subtree middle');
    await child(owner, project.id, mid.id, 'Subtree leaf');

    // …cannot hang off something already three levels down.
    let deep = await createTask(owner, project.id, { title: 'Deep zero' });
    for (let i = 1; i <= 3; i += 1) deep = await child(owner, project.id, deep.id, `Deep ${i}`);

    const res = await api().patch(`/api/v1/tasks/${root.id}`)
      .set(auth(owner.accessToken)).send({ parentTaskId: deep.id, version: root.version });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('subtasks');
  });
});

describe('deleting a parent (FR-F-07)', () => {
  it('lifts children to the grandparent by default', async () => {
    const { owner, project } = await setup();
    const grandparent = await createTask(owner, project.id, { title: 'Grandparent card' });
    const parent = await child(owner, project.id, grandparent.id, 'Parent card');
    const kid = await child(owner, project.id, parent.id, 'Child card');

    const res = await api().delete(`/api/v1/tasks/${parent.id}`).set(auth(owner.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.reparentedTo).toBe(grandparent.id);

    const survivor = await api().get(`/api/v1/tasks/${kid.id}`).set(auth(owner.accessToken));
    expect(survivor.status).toBe(200);
    expect(survivor.body.task.parentTaskId).toBe(grandparent.id);
    expect(survivor.body.task.depth).toBe(1);
  });

  it('promotes children to the top level when there is no grandparent', async () => {
    const { owner, project } = await setup();
    const parent = await createTask(owner, project.id, { title: 'Lone parent' });
    const kid = await child(owner, project.id, parent.id, 'Only child');

    const res = await api().delete(`/api/v1/tasks/${parent.id}`).set(auth(owner.accessToken));
    expect(res.body.reparentedTo).toBeNull();

    const survivor = await api().get(`/api/v1/tasks/${kid.id}`).set(auth(owner.accessToken));
    expect(survivor.body.task.parentTaskId).toBeNull();
    expect(survivor.body.task.depth).toBe(0);
  });

  it('removes the whole subtree when cascade is requested', async () => {
    const { owner, project } = await setup();
    const parent = await createTask(owner, project.id, { title: 'Doomed parent' });
    const kid = await child(owner, project.id, parent.id, 'Doomed child');
    const grandkid = await child(owner, project.id, kid.id, 'Doomed grandchild');

    const res = await api().delete(`/api/v1/tasks/${parent.id}?strategy=CASCADE`).set(auth(owner.accessToken));
    expect(res.status).toBe(200);

    for (const id of [parent.id, kid.id, grandkid.id]) {
      expect((await api().get(`/api/v1/tasks/${id}`).set(auth(owner.accessToken))).status).toBe(404);
    }
  });

  it('keeps the rest of the board intact after a cascade', async () => {
    const { owner, project } = await setup();
    const keep = await createTask(owner, project.id, { title: 'Innocent bystander' });
    const parent = await createTask(owner, project.id, { title: 'Doomed parent' });
    await child(owner, project.id, parent.id, 'Doomed child');

    await api().delete(`/api/v1/tasks/${parent.id}?strategy=CASCADE`).set(auth(owner.accessToken));

    const snapshot = await boardSnapshot(owner, project.id);
    expect(snapshot.tasks.map((t) => t.id)).toEqual([keep.id]);
  });
});
