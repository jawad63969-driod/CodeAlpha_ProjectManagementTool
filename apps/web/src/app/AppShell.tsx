import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../shared/auth/AuthContext.jsx';
import { usePresence } from '../shared/realtime/presenceStore.js';
import { useTheme } from '../shared/hooks/useTheme.js';
import { Avatar } from '../shared/ui/Avatar.jsx';
import { Icon, Logo } from '../shared/ui/Icon.jsx';
import { ErrorLine, IconButton } from '../shared/ui/misc.jsx';
import { endpoints, keys } from '../shared/api/endpoints.js';
import { NotificationBell } from '../features/notifications/NotificationBell.jsx';

const WorkspaceMenu = () => {
  const { session, signOut, switchWorkspace } = useAuth();
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const {
    data,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: keys.workspaces,
    queryFn: endpoints.workspaces,
    enabled: open,
  });

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (holder.current && !holder.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const others = (data?.workspaces ?? []).filter((w) => w.organization.id !== session?.organization.id);

  return (
    <div className="menu" ref={holder}>
      <button type="button" className="menu__trigger" onClick={() => setOpen((v) => !v)} aria-haspopup="menu">
        <Avatar person={session?.user} size={22} />
        <span className="menu__name truncate">{session?.user.name}</span>
        <Icon name="chevronDown" size={13} />
      </button>
      {open && (
        <div className="dropdown dropdown--wide" role="menu">
          <div className="dropdown__head" style={{ display: 'block', textTransform: 'none', letterSpacing: 0 }}>
            <div className="member-row__name">{session?.user.name}</div>
            <div className="member-row__mail">{session?.user.email}</div>
          </div>
          {/* A failed workspace list used to be indistinguishable from "you
              belong to one workspace", so the switcher simply vanished. */}
          {isError && (
            <div className="dropdown__section">
              <ErrorLine
                message="Could not load your workspaces"
                retrying={isFetching}
                onRetry={() => void refetch()}
              />
            </div>
          )}
          {!isError && others.length > 0 && (
            <div className="dropdown__section">
              {others.map((workspace) => (
                <button
                  key={workspace.organization.id}
                  type="button"
                  className="dropdown__item"
                  onClick={async () => {
                    setOpen(false);
                    await switchWorkspace(workspace.organization.id);
                    navigate('/');
                  }}
                >
                  <Icon name="folder" size={14} />
                  <span className="truncate">{workspace.organization.name}</span>
                </button>
              ))}
            </div>
          )}
          <div className="dropdown__section">
            <button
              type="button"
              className="dropdown__item"
              onClick={() => {
                setOpen(false);
                navigate('/members');
              }}
            >
              <Icon name="users" size={14} />
              <span>Workspace members</span>
            </button>
            <button type="button" className="dropdown__item dropdown__item--danger" onClick={() => void signOut()}>
              <Icon name="logout" size={14} />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const Sidebar = ({ open, onNavigate }: { open: boolean; onNavigate: () => void }) => {
  const { session } = useAuth();
  const location = useLocation();
  const { data, isError, isFetching, refetch } = useQuery({
    queryKey: keys.projects,
    queryFn: () => endpoints.projects(),
  });
  const projects = data?.projects ?? [];

  return (
    <aside className={`sidebar${open ? ' is-open' : ''}`}>
      <div className="sidebar__brand">
        <span className="sidebar__mark">
          <Logo size={16} />
        </span>
        <span className="grow truncate">
          <div className="sidebar__name">TaskForge</div>
          <div className="sidebar__org truncate">{session?.organization.name}</div>
        </span>
      </div>

      <nav className="sidebar__group">
        <NavLink
          to="/"
          end
          onClick={onNavigate}
          className={({ isActive }) => `sidebar__link${isActive ? ' is-active' : ''}`}
        >
          <Icon name="folder" size={15} />
          <span>Projects</span>
          {/* A count of 0 is a claim about the data. Don't make it when the
              request failed or has not answered yet. */}
          {!isError && data && <span className="sidebar__count">{projects.length}</span>}
        </NavLink>
        <NavLink
          to="/my-work"
          onClick={onNavigate}
          className={({ isActive }) => `sidebar__link${isActive ? ' is-active' : ''}`}
        >
          <Icon name="checkCircle" size={15} />
          <span>My work</span>
        </NavLink>
        <NavLink
          to="/members"
          onClick={onNavigate}
          className={({ isActive }) => `sidebar__link${isActive ? ' is-active' : ''}`}
        >
          <Icon name="users" size={15} />
          <span>Members</span>
        </NavLink>
      </nav>

      {isError && (
        <div className="sidebar__group sidebar__projects">
          <div className="sidebar__label">Projects</div>
          <ErrorLine message="Could not load projects" retrying={isFetching} onRetry={() => void refetch()} />
        </div>
      )}

      {!isError && projects.length > 0 && (
        <div className="sidebar__group sidebar__projects">
          <div className="sidebar__label">Projects</div>
          {projects.map((project) => (
            <NavLink
              key={project.id}
              to={`/projects/${project.id}`}
              onClick={onNavigate}
              className={`sidebar__project${location.pathname.startsWith(`/projects/${project.id}`) ? ' is-active' : ''}`}
            >
              <span className="sidebar__swatch" style={{ background: project.color }} aria-hidden="true" />
              <span className="truncate">{project.name}</span>
            </NavLink>
          ))}
        </div>
      )}
    </aside>
  );
};

export const AppShell = ({ children }: { children: ReactNode }) => {
  const connected = usePresence((state) => state.connected);
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="shell">
      {menuOpen && <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />

      <div className="shell__main">
        <header className="topbar">
          <IconButton
            icon="list"
            label="Open navigation"
            className="topbar__menu-toggle"
            onClick={() => setMenuOpen((v) => !v)}
          />

          <div className="topbar__right">
            <span
              className={`live-dot${connected ? ' is-live' : ''}`}
              title={connected ? 'Live updates connected' : 'Reconnecting…'}
            >
              <span>{connected ? 'Live' : 'Offline'}</span>
            </span>
            <IconButton
              icon={theme === 'light' ? 'moon' : 'sun'}
              label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
              onClick={toggle}
            />
            <NotificationBell />
            <WorkspaceMenu />
          </div>
        </header>
        <main className="shell__main">{children}</main>
      </div>
    </div>
  );
};
