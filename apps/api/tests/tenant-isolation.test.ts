import { describe, expect, it } from 'vitest';
import { api } from './helpers/app.js';
import { addToWorkspace, auth, memberOf, registerAccount, sessionInWorkspace } from './helpers/factories.js';

/**
 * The suite that proves NFR-08. Tenancy is the one property where a single hole
 * is catastrophic, so it is tested as behaviour rather than trusted as a
 * convention: data, existence and side effects must all stop at the boundary.
 */
describe('tenant isolation — data', () => {
  it('shows a caller only the members of the workspace their token is scoped to', async () => {
    const northwind = await registerAccount({ name: 'Ayesha', organizationName: 'Northwind Labs' });
    const acme = await registerAccount({ name: 'Rival Owner', organizationName: 'Acme Corp' });
    await memberOf(northwind, 'MEMBER', 'Northwind Dev');
    await memberOf(acme, 'MEMBER', 'Acme Dev');

    const asNorthwind = await api().get('/api/v1/organization/members').set(auth(northwind.accessToken));
    const names = asNorthwind.body.members.map((m: { name: string }) => m.name);

    expect(names).toContain('Northwind Dev');
    expect(names).not.toContain('Acme Dev');
    expect(names).not.toContain('Rival Owner');
  });

  it('scopes the member list to the token, not to the person, for someone in two workspaces', async () => {
    const northwind = await registerAccount({ organizationName: 'Northwind Labs' });
    const { account: dual } = await memberOf(northwind, 'ADMIN', 'Dual Citizen');

    const ownSession = dual; // their own personal workspace
    const northwindSession = await sessionInWorkspace(dual, northwind.organization.id);

    const inOwn = await api().get('/api/v1/organization/members').set(auth(ownSession.accessToken));
    const inNorthwind = await api().get('/api/v1/organization/members').set(auth(northwindSession.accessToken));

    expect(inOwn.body.members).toHaveLength(1);
    expect(inNorthwind.body.members.length).toBeGreaterThan(1);
  });
});

describe('tenant isolation — existence is not leaked', () => {
  it('reports another workspace’s member as missing, not forbidden', async () => {
    const acme = await registerAccount({ organizationName: 'Acme Corp' });
    const { account: acmeDev } = await memberOf(acme, 'MEMBER');
    const outsider = await registerAccount();

    const res = await api().patch(`/api/v1/organization/members/${acmeDev.user.id}/role`)
      .set(auth(outsider.accessToken)).send({ role: 'ADMIN' });

    // 404, not 403: a 403 would confirm the id exists somewhere.
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('gives the same answer for a real foreign id and an invented one', async () => {
    const acme = await registerAccount();
    const { account: acmeDev } = await memberOf(acme, 'MEMBER');
    const outsider = await registerAccount();

    const real = await api().delete(`/api/v1/organization/members/${acmeDev.user.id}`)
      .set(auth(outsider.accessToken));
    const invented = await api().delete('/api/v1/organization/members/usr_DOESNOTEXIST0000000000')
      .set(auth(outsider.accessToken));

    expect(real.status).toBe(invented.status);
    expect(real.body.error.message).toBe(invented.body.error.message);
  });

  it('refuses to switch into a workspace the caller has never joined', async () => {
    const outsider = await registerAccount();
    const acme = await registerAccount({ organizationName: 'Acme Corp' });

    const res = await api().post('/api/v1/auth/workspaces/switch')
      .set(auth(outsider.accessToken)).send({ organizationId: acme.organization.id });
    expect(res.status).toBe(404);
  });
});

describe('tenant isolation — side effects stop at the boundary', () => {
  it('keeps a refresh inside the workspace the session was minted for', async () => {
    const northwind = await registerAccount({ organizationName: 'Northwind Labs' });
    const { account: dual } = await memberOf(northwind, 'MEMBER', 'Dual Citizen');
    const northwindSession = await sessionInWorkspace(dual, northwind.organization.id);

    const refreshed = await api().post('/api/v1/auth/refresh')
      .send({ refreshToken: northwindSession.refreshToken });
    expect(refreshed.status).toBe(200);

    const me = await api().get('/api/v1/auth/me').set(auth(refreshed.body.accessToken));
    // Not the personal workspace they registered with — the one they refreshed in.
    expect(me.body.organization.id).toBe(northwind.organization.id);
    expect(me.body.orgRole).toBe('MEMBER');
  });

  it('suspends a person in one workspace without touching their access to another', async () => {
    const northwind = await registerAccount({ organizationName: 'Northwind Labs' });
    const { account: dual } = await memberOf(northwind, 'MEMBER', 'Dual Citizen');
    const northwindSession = await sessionInWorkspace(dual, northwind.organization.id);

    const suspended = await api().patch(`/api/v1/organization/members/${dual.user.id}/status`)
      .set(auth(northwind.accessToken)).send({ status: 'SUSPENDED' });
    expect(suspended.status).toBe(200);

    // Locked out of Northwind…
    const blocked = await api().get('/api/v1/auth/me').set(auth(northwindSession.accessToken));
    expect(blocked.status).toBe(403);

    // …but still fully in charge of their own workspace.
    const ownWorkspace = await api().get('/api/v1/auth/me').set(auth(dual.accessToken));
    expect(ownWorkspace.status).toBe(200);
    expect(ownWorkspace.body.orgRole).toBe('OWNER');
  });

  it('removes a person from one workspace without disturbing the other', async () => {
    const northwind = await registerAccount({ organizationName: 'Northwind Labs' });
    const { account: dual } = await memberOf(northwind, 'MEMBER', 'Dual Citizen');
    const northwindSession = await sessionInWorkspace(dual, northwind.organization.id);

    await api().delete(`/api/v1/organization/members/${dual.user.id}`).set(auth(northwind.accessToken));

    expect((await api().get('/api/v1/auth/me').set(auth(northwindSession.accessToken))).status).toBe(401);
    expect((await api().get('/api/v1/auth/me').set(auth(dual.accessToken))).status).toBe(200);

    const workspaces = await api().get('/api/v1/auth/workspaces').set(auth(dual.accessToken));
    expect(workspaces.body.workspaces).toHaveLength(1);
  });

  it('does not let a revoked workspace session be resurrected by refresh', async () => {
    const northwind = await registerAccount();
    const { account: dual } = await memberOf(northwind, 'MEMBER');
    const northwindSession = await sessionInWorkspace(dual, northwind.organization.id);

    await api().delete(`/api/v1/organization/members/${dual.user.id}`).set(auth(northwind.accessToken));

    const res = await api().post('/api/v1/auth/refresh')
      .send({ refreshToken: northwindSession.refreshToken });
    expect(res.status).toBe(401);
  });
});
