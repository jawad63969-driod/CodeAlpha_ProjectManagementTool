import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { TaskDto } from '@taskforge/shared';
import { endpoints, keys } from '../../shared/api/endpoints.js';
import { EmptyState, ErrorState, Priority, Section, Spinner, TypeIcon } from '../../shared/ui/misc.jsx';
import { ApiError } from '../../shared/api/client.js';
import { Icon } from '../../shared/ui/Icon.jsx';
import { dueState } from '../../shared/hooks/time.js';

/**
 * The page claimed "most urgent first" but showed one flat list with no
 * grouping and no visible ordering, so the claim was unverifiable. Cards are
 * now bucketed by how soon they are due, which is what "urgent" meant.
 */
const BUCKETS = ['Overdue', 'Due this week', 'Scheduled', 'No due date'] as const;
type Bucket = (typeof BUCKETS)[number];

const bucketFor = (task: TaskDto): Bucket => {
  if (!task.dueDate) return 'No due date';
  const days = Math.ceil((new Date(`${task.dueDate}T23:59:59`).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'Overdue';
  if (days <= 7) return 'Due this week';
  return 'Scheduled';
};

export const MyWorkPage = () => {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: keys.myWork,
    queryFn: endpoints.myWork,
  });

  if (isLoading) return <Spinner full label="Gathering your work" />;
  const tasks = data?.data ?? [];

  const grouped = new Map<Bucket, TaskDto[]>();
  for (const task of tasks) {
    const bucket = bucketFor(task);
    const existing = grouped.get(bucket);
    if (existing) existing.push(task);
    else grouped.set(bucket, [task]);
  }

  return (
    <div className="page">
      <div className="page__inner page__inner--measure">
        <div className="page__head">
          <div>
            <h1 className="page__title">My work</h1>
            <p className="page__subtitle">
              Everything open and assigned to you, across every project — soonest first.
            </p>
          </div>
        </div>

        {/* "Nothing on your plate" told a person with a full queue that they
            had no work, purely because one request failed. */}
        {isError ? (
          <ErrorState
            title="Could not load your work"
            message={
              error instanceof ApiError
                ? error.message
                : 'The request did not reach the server. Nothing has been unassigned — this is a connection problem.'
            }
            retrying={isFetching}
            onRetry={() => void refetch()}
          />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon="checkCircle"
            title="Nothing on your plate"
            message="No open cards are assigned to you right now."
          />
        ) : (
          BUCKETS.filter((bucket) => grouped.has(bucket)).map((bucket) => (
            <div key={bucket} className="work-group">
              <Section title={`${bucket} · ${grouped.get(bucket)!.length}`}>
                <div className="card">
                  {grouped.get(bucket)!.map((task) => {
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
                            {task.commentCount > 0 && (
                              <span className="task-card__stat">
                                <Icon name="message" size={12} />
                                {task.commentCount}
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
          ))
        )}
      </div>
    </div>
  );
};
