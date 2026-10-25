import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/* ==========================================================================
   Buttons
   One component with explicit variants, so a "secondary action" is a prop
   rather than whatever styling the screen author reached for. The login
   page previously gave "Use the demo account" the same weight as "Sign in".
   ========================================================================== */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconAfter?: IconName;
  block?: boolean;
  loading?: boolean;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = ({
  variant = 'secondary',
  size = 'md',
  icon,
  iconAfter,
  block = false,
  loading = false,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) => (
  <button
    type={type}
    disabled={disabled ?? loading}
    className={[
      'btn',
      `btn--${variant}`,
      size === 'sm' ? 'btn--sm' : '',
      block ? 'btn--block' : '',
      loading ? 'is-loading' : '',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ')}
    {...rest}
  >
    {loading ? <span className="spinner spinner--btn" aria-hidden="true" /> : icon && <Icon name={icon} size={14} />}
    {children && <span>{children}</span>}
    {iconAfter && <Icon name={iconAfter} size={14} />}
  </button>
);

/** A square button that is only an icon. Always needs an accessible label. */
export const IconButton = ({
  icon,
  label,
  size = 'md',
  tone,
  className,
  type = 'button',
  ...rest
}: {
  icon: IconName;
  label: string;
  size?: ButtonSize;
  tone?: 'danger';
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) => (
  <button
    type={type}
    title={label}
    aria-label={label}
    className={['icon-btn', size === 'sm' ? 'icon-btn--sm' : '', tone ? `icon-btn--${tone}` : '', className ?? '']
      .filter(Boolean)
      .join(' ')}
    {...rest}
  >
    <Icon name={icon} size={size === 'sm' ? 13 : 15} />
  </button>
);

/* ==========================================================================
   Form field
   Label, control and error in one place, so every form on every screen
   spaces them identically.
   ========================================================================== */

export const Field = ({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
}) => (
  <div className="field">
    <label className="field__label" htmlFor={htmlFor}>
      {label}
    </label>
    {children}
    {hint && !error && <p className="field__hint">{hint}</p>}
    {error && <p className="field__error">{error}</p>}
  </div>
);

/* ==========================================================================
   Status and meaning
   ========================================================================== */

/** Must cover every member of the Priority enum in @taskforge/shared. */
const titleCase = (value: string): string =>
  value.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

const PRIORITY_META: Record<string, { icon: IconName; label: string }> = {
  critical: { icon: 'alert', label: 'Critical' },
  high: { icon: 'arrowUp', label: 'High' },
  medium: { icon: 'equals', label: 'Medium' },
  low: { icon: 'arrowDown', label: 'Low' },
  lowest: { icon: 'arrowDown', label: 'Lowest' },
};

/**
 * Priority used to be a 6px coloured square with no legend anywhere in the
 * product, which made it undecodable. It now carries a distinct shape per
 * level, so it survives greyscale and colour blindness, and it can show its
 * name where there is room for it.
 */
export const Priority = ({ priority, withLabel = false }: { priority: string; withLabel?: boolean }) => {
  const key = priority.toLowerCase();
  // Falling back to `medium` made a LOWEST card claim to be Medium — a wrong
  // statement about the data. An unknown value now shows itself instead.
  const meta = PRIORITY_META[key] ?? { icon: 'equals' as IconName, label: titleCase(priority) };
  return (
    <span className={`prio prio--${key}`} title={`${meta.label} priority`}>
      <Icon name={meta.icon} size={13} />
      {withLabel && <span>{meta.label}</span>}
    </span>
  );
};

const TYPE_META: Record<string, { icon: IconName; label: string }> = {
  EPIC: { icon: 'epic', label: 'Epic' },
  STORY: { icon: 'story', label: 'Story' },
  TASK: { icon: 'square', label: 'Task' },
  BUG: { icon: 'bug', label: 'Bug' },
  SUBTASK: { icon: 'subtask', label: 'Subtask' },
};

export const TypeIcon = ({ type }: { type: string }) => {
  const meta = TYPE_META[type] ?? TYPE_META.TASK!;
  return (
    <span className={`type-icon type-icon--${type.toLowerCase()}`} title={meta.label}>
      <Icon name={meta.icon} size={13} />
    </span>
  );
};

/** The human name of a task type, for lists that have room for words. */
export const typeLabel = (type: string): string => TYPE_META[type]?.label ?? 'Task';

export const StatusPill = ({ name, category }: { name: string; category?: string }) => (
  <span className={`status-pill status-pill--${(category ?? 'todo').toLowerCase()}`}>
    <span className="status-pill__dot" aria-hidden="true" />
    {name}
  </span>
);

export const Chip = ({
  children,
  tone,
  icon,
}: {
  children: ReactNode;
  tone?: string;
  icon?: IconName;
}) => (
  <span className={`chip${tone ? ` chip--${tone.toLowerCase()}` : ''}`}>
    {icon && <Icon name={icon} size={12} />}
    {children}
  </span>
);

export const LabelPill = ({ name }: { name: string }) => (
  <span className={`label-pill label-pill--${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{name}</span>
);

/* ==========================================================================
   Feedback
   ========================================================================== */

export const Spinner = ({ label = 'Loading', full = false }: { label?: string; full?: boolean }) => (
  <div className={full ? 'spinner-screen' : 'spinner-inline'}>
    <span className="spinner" aria-hidden="true" />
    <span className="muted small">{label}…</span>
  </div>
);

/** Placeholder blocks that hold the shape of content while it loads. */
export const Skeleton = ({ rows = 3, className }: { rows?: number; className?: string }) => (
  <div className={`skeleton${className ? ` ${className}` : ''}`} aria-hidden="true">
    {Array.from({ length: rows }, (_, index) => (
      <span key={index} className="skeleton__row" />
    ))}
  </div>
);

export const EmptyState = ({
  icon = 'inbox',
  title,
  message,
  action,
  compact = false,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  action?: ReactNode;
  compact?: boolean;
}) => (
  <div className={`empty${compact ? ' empty--compact' : ''}`}>
    <span className="empty__icon" aria-hidden="true">
      <Icon name={icon} size={compact ? 16 : 20} />
    </span>
    <h3 className="empty__title">{title}</h3>
    {message && <p className="empty__message">{message}</p>}
    {action && <div className="empty__action">{action}</div>}
  </div>
);

/**
 * What a screen shows when a query FAILED, as opposed to when it succeeded and
 * came back empty. Those are different facts and the product used to state the
 * second one for both: a dropped connection rendered "No projects yet", which
 * is a confident lie about the user's data and offers no way out of it.
 *
 * Every failed query gets this instead — the reason, and a button that retries
 * the same query rather than asking the user to reload the whole app.
 */
export const ErrorState = ({
  icon = 'alert',
  title,
  message,
  onRetry,
  retrying = false,
  compact = false,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
}) => (
  <div className={`empty empty--error${compact ? ' empty--compact' : ''}`} role="alert">
    <span className="empty__icon empty__icon--error" aria-hidden="true">
      <Icon name={icon} size={compact ? 16 : 20} />
    </span>
    <h3 className="empty__title">{title}</h3>
    {message && <p className="empty__message">{message}</p>}
    {onRetry && (
      <div className="empty__action">
        <Button size={compact ? 'sm' : 'md'} icon="refresh" loading={retrying} onClick={onRetry}>
          {retrying ? 'Retrying…' : 'Try again'}
        </Button>
      </div>
    )}
  </div>
);

/**
 * The one-line version, for places with no room for a panel — a dropdown, a
 * sidebar group, a popover. Still says it failed and still offers the retry.
 */
export const ErrorLine = ({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}) => (
  <div className="error-line" role="alert">
    <Icon name="alert" size={13} />
    <span className="grow truncate">{message}</span>
    {onRetry && (
      <button type="button" className="error-line__retry" onClick={onRetry} disabled={retrying}>
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
    )}
  </div>
);

export const ErrorNote = ({ children }: { children: ReactNode }) =>
  children ? (
    <div className="alert alert--error" role="alert">
      <Icon name="alert" size={14} />
      <span>{children}</span>
    </div>
  ) : null;

export const InfoNote = ({ icon = 'lock', children }: { icon?: IconName; children: ReactNode }) => (
  <div className="alert alert--info">
    <Icon name={icon} size={14} />
    <span>{children}</span>
  </div>
);

/* ==========================================================================
   Tabs
   ========================================================================== */

export const Tabs = <T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: ReadonlyArray<{ id: T; label: string; count?: number | string }>;
  active: T;
  onChange: (id: T) => void;
}) => (
  <div className="tabs" role="tablist">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={active === tab.id}
        className={`tabs__tab${active === tab.id ? ' is-active' : ''}`}
        onClick={() => onChange(tab.id)}
      >
        {tab.label}
        {tab.count !== undefined && tab.count !== '' && <span className="tabs__count">{tab.count}</span>}
      </button>
    ))}
  </div>
);

/** A labelled group inside a panel, so long forms read as sections. */
export const Section = ({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) => (
  <section className="section">
    <header className="section__head">
      <h4 className="section__title">{title}</h4>
      {action}
    </header>
    {children}
  </section>
);
