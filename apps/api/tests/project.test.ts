import { describe, expect, it } from 'vitest';
import { api } from './helpers/app.js';
import { addProjectMember, auth, createProject, memberOf, registerAccount } from './helpers/factories.js';

describe('project creation', () => {
  it('provisions a project with a derived key', async () => {
    const owner = await registerAccount();
    const res = await api().post('/api/v1/projects').set(auth(owner.accessToken))
      .send({ name: 'TaskForge Platform', description: 'The product itself' });

    expect(res.status).toBe(201);
    expect(res.body.project.key).toBe('TASK');
    expect(res.body.project.role).toBe('PROJECT_MANAGER');
    expect(res.body.project.memberCount).toBe(1);
    expect(res.body.project.archived).toBe(false);
  });

  it('accepts an explicit key and upper-cases it', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner, { name: 'Mobile Revamp', key: 'mob' });
    expect(project.key).toBe('MOB');
  });

  it('makes a derived key unique within the workspace', async () => {
    const owner = await registerAccount();
    const first = await createProject(owner, { name: 'Delivery Engine' });
    const second = await createProject(owner, { name: 'Delivery Engine Two' });
    expect(first.key).toBe('DELI');
    expect(second.key).not.toBe(first.key);
  });

  it('rejects a duplicate explicit key', async () => {
    const owner = await registerAccount();
    await createProject(owner, { name: 'First', key: 'DUP' });
    const res = await api().post('/api/v1/projects').set(auth(owner.accessToken))
      .send({ name: 'Second', key: 'DUP' });
    expect(res.status).toBe(409);
  });

  it('rejects a key that is not letters', async () => {
    const owner = await registerAccount();
    const res = await api().post('/api/v1/projects').set(auth(owner.accessToken))
      .send({ name: 'Bad Key', key: 'AB-12' });
    expect(res.status).toBe(400);
  });

  it('stops a guest from creating a project', async () => {
    const owner = await registerAccount();
    const { token } = await memberOf(owner, 'GUEST');
    const res = await api().post('/api/v1/projects').set(auth(token)).send({ name: 'Sneaky Project' });
    expect(res.status).toBe(403);
  });
});

describe('project visibility', () => {
  it('shows a workspace member only the projects they belong to', async () => {
    const owner = await registerAccount();
    await createProject(owner, { name: 'Secret Project' });
    const { token: memberToken } = await memberOf(owner, 'MEMBER');

    const res = await api().get('/api/v1/projects').set(auth(memberToken));
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(0);
  });

  it('shows a project once the person is added to it', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner, { name: 'Shared Project' });
    const { account: member, token } = await memberOf(owner, 'MEMBER');
    await addProjectMember(owner, project.id, member.user.id, 'DEVELOPER');

    const res = await api().get('/api/v1/projects').set(auth(token));
    expect(res.body.projects).toHaveLength(1);
    expect(res.body.projects[0].role).toBe('DEVELOPER');
  });

  it('shows an org admin every project without project membership', async () => {
    const owner = await registerAccount();
    await createProject(owner, { name: 'Alpha' });
    await createProject(owner, { name: 'Beta' });
    const { token: adminToken } = await memberOf(owner, 'ADMIN');

    const res = await api().get('/api/v1/projects').set(auth(adminToken));
    expect(res.body.projects).toHaveLength(2);
    expect(res.body.projects[0].role).toBeNull();
  });

  it('refuses a workspace member who is not on the project', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const { token } = await memberOf(owner, 'MEMBER');

    const res = await api().get(`/api/v1/projects/${project.id}`).set(auth(token));
    expect(res.status).toBe(403);
  });

  it('reports another tenant’s project as missing, not forbidden', async () => {
    const acme = await registerAccount({ organizationName: 'Acme' });
    const project = await createProject(acme);
    const outsider = await registerAccount();

    const res = await api().get(`/api/v1/projects/${project.id}`).set(auth(outsider.accessToken));
    expect(res.status).toBe(404);
  });

  it('returns the caller’s effective permissions with the project', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const { account: viewer, token } = await memberOf(owner, 'MEMBER');
    await addProjectMember(owner, project.id, viewer.user.id, 'VIEWER');

    const res = await api().get(`/api/v1/projects/${project.id}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.permissions).toContain('project.read');
    expect(res.body.permissions).not.toContain('task.create');
  });
});

describe('project lifecycle', () => {
  it('renames and recolours a project', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const res = await api().patch(`/api/v1/projects/${project.id}`).set(auth(owner.accessToken))
      .send({ name: 'Renamed', color: '#0ea5e9' });

    expect(res.status).toBe(200);
    expect(res.body.project.name).toBe('Renamed');
    expect(res.body.project.color).toBe('#0ea5e9');
    expect(res.body.project.key).toBe(project.key);
  });

  it('archives and restores', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);

    const archived = await api().patch(`/api/v1/projects/${project.id}`).set(auth(owner.accessToken))
      .send({ archived: true });
    expect(archived.body.project.archived).toBe(true);

    const hidden = await api().get('/api/v1/projects').set(auth(owner.accessToken));
    expect(hidden.body.projects).toHaveLength(0);

    const visible = await api().get('/api/v1/projects?includeArchived=true').set(auth(owner.accessToken));
    expect(visible.body.projects).toHaveLength(1);

    const restored = await api().patch(`/api/v1/projects/${project.id}`).set(auth(owner.accessToken))
      .send({ archived: false });
    expect(restored.body.project.archived).toBe(false);
  });

  it('lets only the workspace owner delete a project', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const { account: admin, token: adminToken } = await memberOf(owner, 'ADMIN');
    await addProjectMember(owner, project.id, admin.user.id, 'PROJECT_MANAGER');

    const refused = await api().delete(`/api/v1/projects/${project.id}`).set(auth(adminToken));
    expect(refused.status).toBe(403);

    const deleted = await api().delete(`/api/v1/projects/${project.id}`).set(auth(owner.accessToken));
    expect(deleted.status).toBe(200);

    const gone = await api().get(`/api/v1/projects/${project.id}`).set(auth(owner.accessToken));
    expect(gone.status).toBe(404);
  });
});

describe('project membership', () => {
  it('adds a workspace member to a project', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const { account: dev } = await memberOf(owner, 'MEMBER', 'Dev Person');

    const res = await api().post(`/api/v1/projects/${project.id}/members`)
      .set(auth(owner.accessToken)).send({ userId: dev.user.id, role: 'DEVELOPER' });

    expect(res.status).toBe(201);
    expect(res.body.member.role).toBe('DEVELOPER');
    expect(res.body.member.name).toBe('Dev Person');
  });

  it('refuses to add someone who is not in the workspace', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const outsider = await registerAccount();

    const res = await api().post(`/api/v1/projects/${project.id}/members`)
      .set(auth(owner.accessToken)).send({ userId: outsider.user.id, role: 'DEVELOPER' });
    expect(res.status).toBe(404);
  });

  it('refuses to add the same person twice', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const { account: dev } = await memberOf(owner, 'MEMBER');
    await addProjectMember(owner, project.id, dev.user.id);

    const res = await api().post(`/api/v1/projects/${project.id}/members`)
      .set(auth(owner.accessToken)).send({ userId: dev.user.id, role: 'DEVELOPER' });
    expect(res.status).toBe(409);
  });

  it('keeps at least one project manager', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);

    const demote = await api().patch(`/api/v1/projects/${project.id}/members/${owner.user.id}`)
      .set(auth(owner.accessToken)).send({ role: 'DEVELOPER' });
    expect(demote.status).toBe(409);

    const remove = await api().delete(`/api/v1/projects/${project.id}/members/${owner.user.id}`)
      .set(auth(owner.accessToken));
    expect(remove.status).toBe(409);
  });

  it('stops a developer from managing membership', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const { account: dev, token } = await memberOf(owner, 'MEMBER');
    await addProjectMember(owner, project.id, dev.user.id, 'DEVELOPER');
    const { account: other } = await memberOf(owner, 'MEMBER');

    const res = await api().post(`/api/v1/projects/${project.id}/members`)
      .set(auth(token)).send({ userId: other.user.id, role: 'DEVELOPER' });
    expect(res.status).toBe(403);
  });

  it('lets a project manager who is only a workspace member manage the project', async () => {
    const owner = await registerAccount();
    const project = await createProject(owner);
    const { account: pm, token } = await memberOf(owner, 'MEMBER');
    await addProjectMember(owner, project.id, pm.user.id, 'PROJECT_MANAGER');
    const { account: dev } = await memberOf(owner, 'MEMBER');

    const res = await api().post(`/api/v1/projects/${project.id}/members`)
      .set(auth(token)).send({ userId: dev.user.id, role: 'DEVELOPER' });
    expect(res.status).toBe(201);
  });
});
