import { describe, expect, it } from 'vitest';
import { api } from './helpers/app.js';
import { addToWorkspace, auth, memberOf, registerAccount, sessionInWorkspace } from './helpers/factories.js';

describe('workspace membership', () => {
  it('starts with the creator as the sole owner', async () => {
    const owner = await registerAccount({ name: 'Ayesha Siddiqui' });
    const res = await api().get('/api/v1/organization/members').set(auth(owner.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].role).toBe('OWNER');
    expect(res.body.members[0].id).toBe(owner.user.id);
  });

  it('adds an existing account as a member', async () => {
    const owner = await registerAccount();
    const invitee = await registerAccount({ name: 'Bilal Ahmed' });

    const res = await api().post('/api/v1/organization/members')
      .set(auth(owner.accessToken))
      .send({ email: invitee.user.email, role: 'MEMBER' });

    expect(res.status).toBe(201);
    expect(res.body.member.id).toBe(invitee.user.id);
    expect(res.body.member.role).toBe('MEMBER');
  });

  it('reports a missing account rather than creating one', async () => {
    const owner = await registerAccount();
    const res = await api().post('/api/v1/organization/members')
      .set(auth(owner.accessToken))
      .send({ email: 'nobody.here@taskforge.test', role: 'MEMBER' });
    expect(res.status).toBe(404);
  });

  it('refuses to add the same person twice', async () => {
    const owner = await registerAccount();
    const invitee = await registerAccount();
    await addToWorkspace(owner, invitee);

    const res = await api().post('/api/v1/organization/members')
      .set(auth(owner.accessToken))
      .send({ email: invitee.user.email, role: 'MEMBER' });
    expect(res.status).toBe(409);
  });

  it('refuses to make someone an owner through the add endpoint', async () => {
    const owner = await registerAccount();
    const invitee = await registerAccount();
    const res = await api().post('/api/v1/organization/members')
      .set(auth(owner.accessToken))
      .send({ email: invitee.user.email, role: 'OWNER' });
    expect(res.status).toBe(400);
  });

  it('promotes and demotes members', async () => {
    const owner = await registerAccount();
    const { account: member } = await memberOf(owner, 'MEMBER');

    const promote = await api().patch(`/api/v1/organization/members/${member.user.id}/role`)
      .set(auth(owner.accessToken)).send({ role: 'ADMIN' });
    expect(promote.status).toBe(200);
    expect(promote.body.member.role).toBe('ADMIN');

    const demote = await api().patch(`/api/v1/organization/members/${member.user.id}/role`)
      .set(auth(owner.accessToken)).send({ role: 'GUEST' });
    expect(demote.body.member.role).toBe('GUEST');
  });

  it('keeps at least one owner (FR-B-05)', async () => {
    const owner = await registerAccount();
    const res = await api().patch(`/api/v1/organization/members/${owner.user.id}/role`)
      .set(auth(owner.accessToken)).send({ role: 'MEMBER' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('at least one owner');
  });

  it('refuses to remove the last owner', async () => {
    const owner = await registerAccount();
    const res = await api().delete(`/api/v1/organization/members/${owner.user.id}`)
      .set(auth(owner.accessToken));
    expect(res.status).toBe(409);
  });

  it('removes a member and kills their sessions', async () => {
    const owner = await registerAccount();
    const { account: member, token } = await memberOf(owner, 'MEMBER');

    const before = await api().get('/api/v1/auth/me').set(auth(token));
    expect(before.status).toBe(200);

    const removed = await api().delete(`/api/v1/organization/members/${member.user.id}`)
      .set(auth(owner.accessToken));
    expect(removed.status).toBe(200);

    // The access token is now worthless because the membership is gone (FR-B-04).
    const after = await api().get('/api/v1/auth/me').set(auth(token));
    expect(after.status).toBe(401);
  });

  it('suspending a member locks them out immediately', async () => {
    const owner = await registerAccount();
    const { account: member, token } = await memberOf(owner, 'MEMBER');

    const suspend = await api().patch(`/api/v1/organization/members/${member.user.id}/status`)
      .set(auth(owner.accessToken)).send({ status: 'SUSPENDED' });
    expect(suspend.status).toBe(200);

    const after = await api().get('/api/v1/auth/me').set(auth(token));
    expect(after.status).toBe(403);
  });
});

describe('workspace permissions (FR-C)', () => {
  it('lets an admin add members', async () => {
    const owner = await registerAccount();
    const { token: adminToken } = await memberOf(owner, 'ADMIN');
    const newcomer = await registerAccount();

    const res = await api().post('/api/v1/organization/members')
      .set(auth(adminToken)).send({ email: newcomer.user.email, role: 'MEMBER' });
    expect(res.status).toBe(201);
  });

  it('stops a plain member from adding anyone', async () => {
    const owner = await registerAccount();
    const { token: memberToken } = await memberOf(owner, 'MEMBER');
    const newcomer = await registerAccount();

    const res = await api().post('/api/v1/organization/members')
      .set(auth(memberToken)).send({ email: newcomer.user.email, role: 'MEMBER' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('stops a guest from even listing the member directory', async () => {
    const owner = await registerAccount();
    const { token: guestToken } = await memberOf(owner, 'GUEST');

    const res = await api().get('/api/v1/organization/members').set(auth(guestToken));
    expect(res.status).toBe(403);
  });

  it('stops an admin from changing an owner', async () => {
    const owner = await registerAccount();
    const { token: adminToken } = await memberOf(owner, 'ADMIN');

    const res = await api().patch(`/api/v1/organization/members/${owner.user.id}/role`)
      .set(auth(adminToken)).send({ role: 'MEMBER' });
    expect(res.status).toBe(403);
  });

  it('reports the caller’s effective permissions', async () => {
    const owner = await registerAccount();
    const res = await api().get('/api/v1/organization').set(auth(owner.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.permissions).toContain('project.create');
    expect(res.body.permissions).toContain('org.member.add');

    const { token: memberToken } = await memberOf(owner, 'MEMBER');
    const asMember = await api().get('/api/v1/organization').set(auth(memberToken));
    expect(asMember.body.permissions).toContain('project.create');
    expect(asMember.body.permissions).not.toContain('org.member.add');
  });
});

describe('workspace switching', () => {
  it('lists every workspace a person belongs to', async () => {
    const owner = await registerAccount({ organizationName: 'Northwind Labs' });
    const { account: member } = await memberOf(owner, 'MEMBER');

    const res = await api().get('/api/v1/auth/workspaces').set(auth(member.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.workspaces).toHaveLength(2);
    expect(res.body.workspaces.map((w: { orgRole: string }) => w.orgRole).sort()).toEqual(['MEMBER', 'OWNER']);
  });

  it('issues a token scoped to the chosen workspace', async () => {
    const owner = await registerAccount({ organizationName: 'Northwind Labs' });
    const { account: member } = await memberOf(owner, 'MEMBER');

    const session = await sessionInWorkspace(member, owner.organization.id);
    expect(session.organization.name).toBe('Northwind Labs');
    expect(session.orgRole).toBe('MEMBER');

    const me = await api().get('/api/v1/auth/me').set(auth(session.accessToken));
    expect(me.body.organization.id).toBe(owner.organization.id);
    expect(me.body.orgRole).toBe('MEMBER');
  });

  it('refuses to switch into a workspace you do not belong to', async () => {
    const outsider = await registerAccount();
    const other = await registerAccount({ organizationName: 'Private Co' });

    const res = await api().post('/api/v1/auth/workspaces/switch')
      .set(auth(outsider.accessToken)).send({ organizationId: other.organization.id });
    expect(res.status).toBe(404);
  });
});
