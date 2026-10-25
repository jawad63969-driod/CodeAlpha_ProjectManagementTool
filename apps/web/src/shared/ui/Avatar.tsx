import type { CSSProperties } from 'react';
import { Icon } from './Icon';

interface Person {
  id?: string;
  name: string;
  avatarColor?: string;
  jobTitle?: string | null;
}

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');

export const Avatar = ({
  person,
  size = 24,
  online = false,
  title,
}: {
  person?: Person | null;
  size?: number;
  online?: boolean;
  title?: string;
}) => {
  const style: CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.max(9, Math.round(size * 0.4)),
  };

  // An unassigned card used to render a grey circle containing "?", which
  // reads as a failed image load. A dashed outline with a faint person
  // glyph says "nobody yet" without looking broken.
  if (!person) {
    return (
      <span
        className="avatar avatar--empty"
        style={style}
        title={title ?? 'Unassigned'}
        aria-label={title ?? 'Unassigned'}
      >
        <Icon name="users" size={Math.round(size * 0.5)} />
      </span>
    );
  }

  return (
    <span
      className={`avatar${online ? ' avatar--online' : ''}`}
      style={{ ...style, background: person.avatarColor ?? 'var(--accent)' }}
      title={title ?? `${person.name}${person.jobTitle ? ` · ${person.jobTitle}` : ''}`}
    >
      {initials(person.name)}
    </span>
  );
};

export const AvatarStack = ({ people, max = 4, size = 22 }: { people: Person[]; max?: number; size?: number }) => (
  <div className="avatar-stack" title={people.map((person) => person.name).join(', ')}>
    {people.slice(0, max).map((person, index) => (
      <span key={person.id ?? index} className="avatar-stack__item">
        <Avatar person={person} size={size} online />
      </span>
    ))}
    {people.length > max && <span className="avatar-stack__more">+{people.length - max}</span>}
  </div>
);
