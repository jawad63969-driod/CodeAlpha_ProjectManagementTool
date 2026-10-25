import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { OrganizationDto, OrgRole, SessionDto, UserDto } from '@taskforge/shared';
import { SESSION_LOST, tokens } from '../api/client.js';
import { endpoints } from '../api/endpoints.js';

interface Session {
  user: UserDto;
  organization: OrganizationDto;
  orgRole: OrgRole;
}

interface AuthValue extends Partial<Session> {
  session: Session | null;
  booting: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { name: string; email: string; password: string; organizationName?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  switchWorkspace: (organizationId: string) => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const queryClient = useQueryClient();

  const adopt = useCallback((result: SessionDto) => {
    tokens.set(result.accessToken, result.refreshToken);
    setSession({ user: result.user, organization: result.organization, orgRole: result.orgRole });
  }, []);

  // Restore the session on a hard refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tokens.access()) {
        setBooting(false);
        return;
      }
      try {
        const me = await endpoints.me();
        if (!cancelled) setSession(me);
      } catch {
        tokens.clear();
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // The api client raises this when refreshing fails for good.
  useEffect(() => {
    const onLost = () => {
      setSession(null);
      queryClient.clear();
    };
    window.addEventListener(SESSION_LOST, onLost);
    return () => window.removeEventListener(SESSION_LOST, onLost);
  }, [queryClient]);

  const value = useMemo<AuthValue>(() => ({
    session,
    user: session?.user,
    organization: session?.organization,
    orgRole: session?.orgRole,
    booting,
    signIn: async (email, password) => adopt(await endpoints.login({ email, password })),
    signUp: async (input) => adopt(await endpoints.register(input)),
    signOut: async () => {
      const refreshToken = tokens.refresh();
      if (refreshToken) await endpoints.logout(refreshToken).catch(() => undefined);
      tokens.clear();
      setSession(null);
      queryClient.clear();
    },
    switchWorkspace: async (organizationId) => {
      adopt(await endpoints.switchWorkspace(organizationId));
      queryClient.clear();
    },
    refreshSession: async () => setSession(await endpoints.me()),
  }), [session, booting, adopt, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
};

/** Narrowed accessor for screens that only render behind a session. */
export const useSession = (): Session => {
  const { session } = useAuth();
  if (!session) throw new Error('useSession used outside an authenticated route');
  return session;
};
