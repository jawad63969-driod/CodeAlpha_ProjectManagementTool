import type { SessionDto } from '@taskforge/shared';
import { api } from './app.js';

let counter = 0;
export const uniqueEmail = (label = 'user'): string => {
  counter += 1;
  return `${label}.${Date.now()}.${counter}@taskforge.test`;
};

export interface Account extends SessionDto {
  password: string;
}

/** Registers a brand-new account, which also provisions its own organisation. */
export const registerAccount = async (
  overrides: Partial<{ name: string; email: string; password: string; organizationName: string }> = {},
): Promise<Account> => {
  const payload = {
    name: overrides.name ?? 'Test Person',
    email: overrides.email ?? uniqueEmail(),
    password: overrides.password ?? 'Password123!',
    ...(overrides.organizationName ? { organizationName: overrides.organizationName } : {}),
  };
  const res = await api().post('/api/v1/auth/register').send(payload);
  if (res.status !== 201) throw new Error(`registerAccount failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...(res.body as SessionDto), password: payload.password };
};

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Adds an existing account to another workspace with a given org role. */
export const addToWorkspace = async (
  host: Account,
  guest: Account,
  role: 'ADMIN' | 'MEMBER' | 'GUEST' = 'MEMBER',
): Promise<void> => {
  const res = await api()
    .post('/api/v1/organization/members')
    .set(auth(host.accessToken))
    .send({ email: guest.user.email, role });
  if (res.status !== 201) throw new Error(`addToWorkspace failed: ${res.status} ${JSON.stringify(res.body)}`);
};

/** Returns a session for `account` scoped to another workspace they belong to. */
export const sessionInWorkspace = async (account: Account, organizationId: string): Promise<SessionDto> => {
  const res = await api()
    .post('/api/v1/auth/workspaces/switch')
    .set(auth(account.accessToken))
    .send({ organizationId });
  if (res.status !== 200) throw new Error(`switch failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as SessionDto;
};

/**
 * Registers `guest`, adds them to `host`'s workspace and returns a token scoped
 * to that workspace — the usual starting point for a permission test.
 */
export const memberOf = async (
  host: Account,
  role: 'ADMIN' | 'MEMBER' | 'GUEST' = 'MEMBER',
  name = 'Team Member',
): Promise<{ account: Account; token: string }> => {
  const account = await registerAccount({ name });
  await addToWorkspace(host, account, role);
  const session = await sessionInWorkspace(account, host.organization.id);
  return { account, token: session.accessToken };
};

/** Creates a project owned by `account` and returns it. */
export const createProject = async (
  account: { accessToken: string },
  overrides: Partial<{ name: string; key: string; description: string; color: string }> = {},
): Promise<{ id: string; key: string; name: string }> => {
  const res = await api()
    .post('/api/v1/projects')
    .set(auth(account.accessToken))
    .send({ name: overrides.name ?? 'TaskForge Platform', ...overrides });
  if (res.status !== 201) throw new Error(`createProject failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.project;
};

/** Adds `userId` to a project with a project role. */
export const addProjectMember = async (
  account: { accessToken: string },
  projectId: string,
  userId: string,
  role: 'PROJECT_MANAGER' | 'DEVELOPER' | 'VIEWER' = 'DEVELOPER',
): Promise<void> => {
  const res = await api()
    .post(`/api/v1/projects/${projectId}/members`)
    .set(auth(account.accessToken))
    .send({ userId, role });
  if (res.status !== 201) throw new Error(`addProjectMember failed: ${res.status} ${JSON.stringify(res.body)}`);
};

/** Loads the board snapshot for a project. */
export const boardSnapshot = async (account: { accessToken: string }, projectId: string) => {
  const res = await api().get(`/api/v1/projects/${projectId}/board`).set(auth(account.accessToken));
  if (res.status !== 200) throw new Error(`boardSnapshot failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as {
    project: { id: string; key: string };
    columns: Array<{ id: string; name: string; category: string; position: number }>;
    tasks: Array<{ id: string; ref: string; title: string; columnId: string; position: number; version: number }>;
    statuses: Array<{ id: string; name: string }>;
    labels: Array<{ id: string; name: string }>;
    members: Array<{ id: string; role: string }>;
    permissions: string[];
  };
};

/** Creates a task and returns it. */
export const createTask = async (
  account: { accessToken: string },
  projectId: string,
  body: Record<string, unknown>,
) => {
  const res = await api().post(`/api/v1/projects/${projectId}/tasks`).set(auth(account.accessToken)).send(body);
  if (res.status !== 201) throw new Error(`createTask failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.task as {
    id: string; ref: string; number: number; title: string; columnId: string; position: number;
    version: number; depth: number; parentTaskId: string | null; resolvedAt: string | null;
    subtaskCount: number; subtaskDoneCount: number; labels: Array<{ id: string }>;
  };
};
