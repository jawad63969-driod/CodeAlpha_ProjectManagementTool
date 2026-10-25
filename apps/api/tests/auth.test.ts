import { describe, expect, it } from 'vitest';
import { api } from './helpers/app.js';
import { auth, registerAccount, uniqueEmail } from './helpers/factories.js';

describe('registration', () => {
  it('creates an account, a personal workspace and an owner membership (FR-B-01)', async () => {
    const email = uniqueEmail('owner');
    const res = await api().post('/api/v1/auth/register').send({
      name: 'Ayesha Siddiqui',
      email,
      password: 'Password123!',
      organizationName: 'Northwind Labs',
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.organization.name).toBe('Northwind Labs');
    expect(res.body.organization.slug).toBe('northwind-labs');
    expect(res.body.orgRole).toBe('OWNER');
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.expiresIn).toBe(900);
  });

  it('derives a workspace name when none is supplied', async () => {
    const account = await registerAccount({ name: 'Bilal Ahmed' });
    expect(account.organization.name).toBe("Bilal's Workspace");
  });

  it('never returns the password hash', async () => {
    const account = await registerAccount();
    expect(JSON.stringify(account)).not.toContain('$2b$');
    expect(JSON.stringify(account)).not.toContain('passwordHash');
  });

  it('rejects a duplicate email with 409', async () => {
    const account = await registerAccount();
    const res = await api().post('/api/v1/auth/register')
      .send({ name: 'Impostor', email: account.user.email, password: 'Password123!' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('enforces the password policy with field-level errors (FR-A-01)', async () => {
    const res = await api().post('/api/v1/auth/register')
      .send({ name: 'Weak', email: uniqueEmail(), password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.some((d: { field: string }) => d.field === 'password')).toBe(true);
  });

  it('requires a letter and a digit in the password', async () => {
    const res = await api().post('/api/v1/auth/register')
      .send({ name: 'Digits Only', email: uniqueEmail(), password: '1234567890123' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d: { message: string }) => d.message.includes('letter'))).toBe(true);
  });

  it('normalises the email to lower case', async () => {
    const email = uniqueEmail('MixedCase').toUpperCase();
    const res = await api().post('/api/v1/auth/register')
      .send({ name: 'Case Test', email, password: 'Password123!' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email.toLowerCase());
  });
});

describe('login', () => {
  it('returns a session for correct credentials', async () => {
    const account = await registerAccount();
    const res = await api().post('/api/v1/auth/login')
      .send({ email: account.user.email, password: account.password });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(account.user.id);
    expect(res.body.orgRole).toBe('OWNER');
  });

  it('gives the same answer for an unknown email and a wrong password (FR-A-05)', async () => {
    const account = await registerAccount();
    const wrongPassword = await api().post('/api/v1/auth/login')
      .send({ email: account.user.email, password: 'NotThePassword1' });
    const unknownEmail = await api().post('/api/v1/auth/login')
      .send({ email: uniqueEmail('ghost'), password: 'NotThePassword1' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe(unknownEmail.body.error.code);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('logs in case-insensitively', async () => {
    const account = await registerAccount();
    const res = await api().post('/api/v1/auth/login')
      .send({ email: account.user.email.toUpperCase(), password: account.password });
    expect(res.status).toBe(200);
  });
});

describe('access tokens', () => {
  it('rejects a request with no token', async () => {
    const res = await api().get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a forged token', async () => {
    const res = await api().get('/api/v1/auth/me').set(auth('not.a.real.token'));
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const jwt = await import('jsonwebtoken');
    const forged = jwt.default.sign({ org: 'org_fake', sid: 'ses_fake' }, 'a'.repeat(40), { subject: 'usr_fake' });
    const res = await api().get('/api/v1/auth/me').set(auth(forged));
    expect(res.status).toBe(401);
  });

  it('returns the caller, their workspace and their role', async () => {
    const account = await registerAccount();
    const res = await api().get('/api/v1/auth/me').set(auth(account.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(account.user.id);
    expect(res.body.organization.id).toBe(account.organization.id);
    expect(res.body.orgRole).toBe('OWNER');
  });

  it('updates the profile and leaves untouched fields alone', async () => {
    const account = await registerAccount({ name: 'Original Name' });
    const res = await api().patch('/api/v1/auth/me')
      .set(auth(account.accessToken))
      .send({ name: 'Updated Name', jobTitle: 'Principal Engineer' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Updated Name');
    expect(res.body.user.jobTitle).toBe('Principal Engineer');
    expect(res.body.user.timezone).toBe('UTC');
  });
});

describe('refresh token rotation (FR-A-03, FR-A-04)', () => {
  it('exchanges a refresh token for a new pair', async () => {
    const account = await registerAccount();
    const res = await api().post('/api/v1/auth/refresh').send({ refreshToken: account.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.refreshToken).not.toBe(account.refreshToken);
  });

  it('issues a working access token on refresh', async () => {
    const account = await registerAccount();
    const refreshed = await api().post('/api/v1/auth/refresh').send({ refreshToken: account.refreshToken });
    const me = await api().get('/api/v1/auth/me').set(auth(refreshed.body.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(account.user.id);
  });

  it('detects reuse of a rotated token and revokes the whole family', async () => {
    const account = await registerAccount();

    const first = await api().post('/api/v1/auth/refresh').send({ refreshToken: account.refreshToken });
    expect(first.status).toBe(200);

    // An attacker replays the original token.
    const replay = await api().post('/api/v1/auth/refresh').send({ refreshToken: account.refreshToken });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('TOKEN_REUSE_DETECTED');

    // The legitimate successor is now dead too — both parties are logged out.
    const afterBreach = await api().post('/api/v1/auth/refresh')
      .send({ refreshToken: first.body.refreshToken });
    expect(afterBreach.status).toBe(401);
  });

  it('rejects an unknown refresh token', async () => {
    const res = await api().post('/api/v1/auth/refresh').send({ refreshToken: 'x'.repeat(64) });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('revokes the chain on logout', async () => {
    const account = await registerAccount();
    const out = await api().post('/api/v1/auth/logout').send({ refreshToken: account.refreshToken });
    expect(out.status).toBe(200);

    const res = await api().post('/api/v1/auth/refresh').send({ refreshToken: account.refreshToken });
    expect(res.status).toBe(401);
  });

  it('treats a second logout as a no-op rather than an error', async () => {
    const account = await registerAccount();
    await api().post('/api/v1/auth/logout').send({ refreshToken: account.refreshToken });
    const again = await api().post('/api/v1/auth/logout').send({ refreshToken: account.refreshToken });
    expect(again.status).toBe(200);
  });

  it('survives a chain of five consecutive rotations', async () => {
    const account = await registerAccount();
    let token = account.refreshToken;
    for (let i = 0; i < 5; i += 1) {
      const res = await api().post('/api/v1/auth/refresh').send({ refreshToken: token });
      expect(res.status).toBe(200);
      token = res.body.refreshToken;
    }
    const me = await api().post('/api/v1/auth/refresh').send({ refreshToken: token });
    expect(me.status).toBe(200);
  });
});
