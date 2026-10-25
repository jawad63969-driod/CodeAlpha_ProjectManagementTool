import type { OrgRole } from '@taskforge/shared';

/** Everything the authorization layer needs, resolved once per request. */
export interface AuthContext {
  userId: string;
  organizationId: string;
  orgRole: OrgRole;
  sessionId: string | null;
  /** Per-request memo of project-role lookups, so one request never asks twice. */
  projectRoleCache: Map<string, string | null>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
