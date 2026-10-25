import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../shared/auth/AuthContext.jsx';
import { endpoints, keys } from '../../shared/api/endpoints.js';
import { ApiError } from '../../shared/api/client.js';
import { Modal } from '../../shared/ui/Modal.jsx';
import { useToast } from '../../shared/ui/Toast.jsx';
import {
  Button,
  Chip,
  EmptyState,
  ErrorNote,
  ErrorState,
  Field,
  Priority,
  Section,
  Spinner,
  TypeIcon,
} from '../../shared/ui/misc.jsx';
import { Icon } from '../../shared/ui/Icon.jsx';
import { relativeTime, dueState } from '../../shared/hooks/time.js';
import { useNavigate } from 'react-router-dom';

const COLORS = ['#5e6ad2', '#0ea5e9', '#14b8a6', '#dd7b1e', '#d93a3f', '#c2489b', '#8b5cf6', '#2f9e68'];

const title = (value: string): string =>
  value.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

/** A project role when there is one, otherwise the workspace role that grants access. */
const roleLabel = (role: string | null | undefined, orgRole: string | undefined): string =>
  role ? title(role) : orgRole ? `${title(orgRole)} · workspace` : 'Workspace access';

const CreateProjectModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', key: '', description: '', color: COLORS[0]! });
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () =>
      endpoints.createProject({
        name: form.name.trim(),
        description: form.description.trim(),
        color: form.color,
        ...(form.key.trim() ? { key: form.key.trim() } : {}),
      }),
    onSuccess: ({ project }) => {
      void queryClient.invalidateQueries({ queryKey: keys.projects });
      toast.success(`${project.name} is ready — board provisioned`);
      setForm({ name: '', key: '', description: '', color: COLORS[0]! });
      onClose();
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : 'Could not create the project'),
  });

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError('');
    create.mutate();
  };

  return (
    <Modal open={open} onClose={onClose} title="New project">
      <form className="stack" onSubmit={submit}>
        <ErrorNote>{error}</ErrorNote>
        <Field label="Project name" htmlFor="project-name">
          <input
            id="project-name"
            required
            minLength={2}
            autoFocus
            value={form.name}
            placeholder="Website redesign"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Board key" htmlFor="project-key" hint="2–10 letters. Becomes WEB-12 on every card.">
          <input
            id="project-key"
            value={form.key}
            maxLength={10}
            placeholder="Derived from the name"
            onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })}
          />
        </Field>
        <Field label="Description" htmlFor="project-desc" hint="Optional. Shown on the project card.">
          <textarea
            id="project-desc"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <Field label="Colour">
          <div className="swatches">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Colour ${color}`}
                aria-pressed={form.color === color}
                className={`swatch${form.color === color ? ' is-active' : ''}`}
                style={{ background: color }}
                onClick={() => setForm({ ...form, color })}
              />
            ))}
          </div>
        </Field>
        <Button type="submit" variant="primary" block loading={create.isPending} icon="plus">
          {create.isPending ? 'Creating…' : 'Create project'}
        </Button>
      </form>
    </Modal>
  );
};

/**
 * A stat tile. Label in sentence case, value in proportional figures — a
 * standalone number set in `tabular-nums` reads loose, because every digit
 * takes the width of a zero. Tabular figures are for columns that must align.
 */
const Stat = ({ label, value, hint }: { label: string; value: number | string; hint?: string }) => (
  <div className="stat">
    <div className="stat__label">{label}</div>
    <div className="stat__value">{value}</div>
    {hint && <div className="stat__hint">{hint}</div>}
  </div>
);

export const ProjectsPage = () => {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: [...keys.projects, showArchived],
    queryFn: () => endpoints.projects(showArchived),
  });

  // The page led with four cards and then several hundred pixels of nothing.
  // What belongs in that space is the work the person actually came to see.
  const mine = useQuery({ queryKey: keys.myWork, queryFn: endpoints.myWork });

  const projects = useMemo(
    () => (data?.projects ?? []).filter((p) => p.name.toLowerCase().includes(filter.toLowerCase())),
    [data, filter],
  );

  if (isLoading) return <Spinner full label="Loading your projects" />;

  // A failed request is not an empty workspace. Saying "No projects yet" here
  // told the user their data was gone when in fact the call never landed.
  if (isError) {
    return (
      <div className="page">
        <div className="page__inner page__inner--wide">
          <ErrorState
            title="Could not load your projects"
            message={
              error instanceof ApiError
                ? error.message
                : 'The request did not reach the server. Your projects are safe — this is a connection problem.'
            }
            retrying={isFetching}
            onRetry={() => void refetch()}
          />
        </div>
      </div>
    );
  }

  const totals = (data?.projects ?? []).reduce(
    (acc, p) => ({ tasks: acc.tasks + (p.taskCount ?? 0), done: acc.done + (p.doneCount ?? 0) }),
    { tasks: 0, done: 0 },
  );

  const assigned = mine.data?.data ?? [];
  const dueSoon = assigned.filter((task) => {
    if (!task.dueDate) return false;
    const days = Math.ceil((new Date(`${task.dueDate}T23:59:59`).getTime() - Date.now()) / 86_400_000);
    return days <= 7;
  }).length;

  return (
    <div className="page">
      <div className="page__inner page__inner--wide">
        <div className="page__head">
          <div>
            <h1 className="page__title">Projects</h1>
            <p className="page__subtitle">
              {data?.projects.length ?? 0} project{data?.projects.length === 1 ? '' : 's'} in{' '}
              {session?.organization.name}
              {totals.tasks > 0 && ` · ${totals.done} of ${totals.tasks} cards done`}
            </p>
          </div>
          <div className="page__actions">
            <div className="search">
              <span className="search__icon">
                <Icon name="search" size={14} />
              </span>
              <input
                placeholder="Search projects…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Search projects"
              />
            </div>
            <Button icon="archive" onClick={() => setShowArchived((v) => !v)} aria-pressed={showArchived}>
              {showArchived ? 'Hide archived' : 'Archived'}
            </Button>
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              New project
            </Button>
          </div>
        </div>

        {(data?.projects.length ?? 0) > 0 && (
          <div className="stat-row">
            <Stat label="Projects" value={data?.projects.length ?? 0} hint={session?.organization.name} />
            <Stat label="Cards" value={totals.tasks} hint="across every project" />
            <Stat
              label="Done"
              value={totals.tasks > 0 ? `${Math.round((totals.done / totals.tasks) * 100)}%` : '—'}
              hint={`${totals.done} of ${totals.tasks}`}
            />
            <Stat
              label="Assigned to you"
              value={mine.isError ? '—' : assigned.length}
              hint={
                mine.isError
                  ? 'could not be loaded'
                  : dueSoon > 0
                    ? `${dueSoon} due within a week`
                    : 'nothing due this week'
              }
            />
          </div>
        )}

        {projects.length === 0 ? (
          <EmptyState
            icon="folder"
            title={data?.projects.length ? 'No project matches that search' : 'No projects yet'}
            message={
              data?.projects.length
                ? 'Try a different name, or clear the search.'
                : 'Create one and its board is provisioned for you — four columns, ready to use.'
            }
            action={
              !data?.projects.length ? (
                <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
                  Create a project
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="project-grid">
            {projects.map((project) => {
              const percent = project.taskCount ? Math.round(((project.doneCount ?? 0) / project.taskCount) * 100) : 0;
              return (
                <Link key={project.id} to={`/projects/${project.id}`} className="project-card">
                  <div className="project-card__head">
                    <span className="project-card__mark" style={{ background: project.color }} aria-hidden="true">
                      {project.key}
                    </span>
                    <div className="grow truncate">
                      <div className="project-card__name truncate">{project.name}</div>
                      <div className="small faint">{roleLabel(project.role, session?.orgRole)}</div>
                    </div>
                    {project.archived && <Chip icon="archive">Archived</Chip>}
                  </div>

                  <p className="project-card__desc">{project.description || 'No description yet.'}</p>

                  <div className="project-card__progress">
                    <div className="progress__track">
                      <div
                        className="progress__fill"
                        style={{ width: `${percent}%`, background: project.color }}
                      />
                    </div>
                    <span className="progress-note">
                      {project.doneCount ?? 0}/{project.taskCount ?? 0} done
                    </span>
                  </div>

                  <div className="project-card__foot">
                    <span className="row">
                      <Icon name="users" size={12} />
                      {project.memberCount}
                    </span>
                    <span className="row">
                      <Icon name="checkSquare" size={12} />
                      {project.taskCount}
                    </span>
                    <span className="grow" />
                    <span>Updated {relativeTime(project.updatedAt)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {mine.isError && (
          <div className="dash-section">
            <Section title="Assigned to you">
              <ErrorState
                compact
                title="Could not load your assigned work"
                message={mine.error instanceof ApiError ? mine.error.message : 'The request did not reach the server.'}
                retrying={mine.isFetching}
                onRetry={() => void mine.refetch()}
              />
            </Section>
          </div>
        )}

        {!mine.isError && assigned.length > 0 && (
          <div className="dash-section">
            <Section
              title={`Assigned to you · ${assigned.length}`}
              action={
                <Button variant="ghost" size="sm" iconAfter="chevronRight" onClick={() => navigate('/my-work')}>
                  My work
                </Button>
              }
            >
              <div className="card">
                {assigned.slice(0, 8).map((task) => {
                  const due = dueState(task.dueDate);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      className="work-row"
                      onClick={() => navigate(`/projects/${task.projectId}?task=${task.id}`)}
                    >
                      <TypeIcon type={task.type} />
                      <span className="work-row__main">
                        <span className="work-row__title truncate">{task.title}</span>
                        <span className="work-row__meta">
                          <span className="task-card__ref">{task.ref}</span>
                          {task.subtaskCount > 0 && (
                            <span className="task-card__stat">
                              <Icon name="checkSquare" size={12} />
                              {task.subtaskDoneCount}/{task.subtaskCount}
                            </span>
                          )}
                        </span>
                      </span>
                      <Priority priority={task.priority} withLabel />
                      {due ? (
                        <span className={`due due--${due.tone}`}>
                          <Icon name="calendar" size={12} />
                          {due.label}
                        </span>
                      ) : (
                        <span className="faint small">—</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Section>
          </div>
        )}

        <CreateProjectModal open={creating} onClose={() => setCreating(false)} />
      </div>
    </div>
  );
};
