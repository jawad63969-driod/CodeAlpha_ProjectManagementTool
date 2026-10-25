import type { ReactNode } from 'react';
import { Icon, Logo, type IconName } from '../../shared/ui/Icon.jsx';

const POINTS: ReadonlyArray<{ icon: IconName; text: string }> = [
  { icon: 'board', text: 'Kanban and list views with keyboard-accessible drag and drop' },
  { icon: 'lock', text: 'Organisation and project roles enforced on every request' },
  { icon: 'subtask', text: 'Subtasks five levels deep, with progress rolled up' },
  { icon: 'activity', text: 'Live updates over WebSockets — no refresh, ever' },
];

export const AuthLayout = ({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) => (
  <div className="auth">
    <section className="auth__aside">
      <div className="auth__brand">
        <Logo size={20} />
        <span>TaskForge</span>
      </div>
      <h1 className="auth__headline">
        Plan the work.
        <br />
        Watch it move.
      </h1>
      <p className="auth__lede">
        Multi-project boards with role-based access, multi-level subtasks, threaded discussion and an audit trail —
        synchronised across everyone in real time.
      </p>
      <ul className="auth__points">
        {POINTS.map((point) => (
          <li key={point.text} className="auth__point">
            <span className="auth__point-icon">
              <Icon name={point.icon} size={14} />
            </span>
            {point.text}
          </li>
        ))}
      </ul>
    </section>

    <section className="auth__panel">
      <div className="auth__card">
        <div>
          <h2 className="auth__title">{title}</h2>
          <p className="auth__sub">{subtitle}</p>
        </div>
        {children}
        <p className="auth__foot">{footer}</p>
      </div>
    </section>
  </div>
);
