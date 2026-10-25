/**
 * The icon set.
 *
 * Every glyph in the interface used to be an emoji — 🌙 for the theme
 * toggle, 🔔 for notifications, ⚡ and 📗 for task types, ✓ for a plain
 * task. Emoji render from the operating system's font, so the product
 * looked different on every machine, none of them intentional, and the ✓
 * on an ordinary task made undone cards read as done.
 *
 * These are drawn on a 16×16 grid with a 1.5 stroke in `currentColor`, so
 * an icon inherits the colour and sizing of whatever it sits in.
 */
import type { SVGProps } from 'react';

export type IconName =
  | 'activity'
  | 'alert'
  | 'archive'
  | 'arrowDown'
  | 'arrowUp'
  | 'bell'
  | 'board'
  | 'bug'
  | 'calendar'
  | 'check'
  | 'checkCircle'
  | 'checkSquare'
  | 'square'
  | 'chevronDown'
  | 'chevronRight'
  | 'close'
  | 'dot'
  | 'download'
  | 'epic'
  | 'equals'
  | 'file'
  | 'filter'
  | 'folder'
  | 'inbox'
  | 'link'
  | 'list'
  | 'lock'
  | 'logout'
  | 'message'
  | 'moon'
  | 'more'
  | 'paperclip'
  | 'plus'
  | 'search'
  | 'settings'
  | 'story'
  | 'subtask'
  | 'sun'
  | 'trash'
  | 'refresh'
  | 'upload'
  | 'users';

/** Paths are stroked unless the entry sets `fill`. */
const PATHS: Record<IconName, { d: string[]; fill?: boolean }> = {
  activity: { d: ['M8 4v4l2.5 1.5', 'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z'] },
  alert: { d: ['M8 5.5v3', 'M8 11h.01', 'M6.8 2.4 1.9 11a1.4 1.4 0 0 0 1.2 2.1h9.8A1.4 1.4 0 0 0 14.1 11L9.2 2.4a1.4 1.4 0 0 0-2.4 0Z'] },
  refresh: { d: ['M13.5 8a5.5 5.5 0 1 1-1.9-4.2', 'M13.7 2.3v3.4h-3.4'] },
  archive: { d: ['M2 5.5h12V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5.5Z', 'M1.5 3.2h13v2.3h-13z', 'M6.5 8.5h3'] },
  arrowDown: { d: ['M8 3.5v9', 'M4.5 9 8 12.5 11.5 9'] },
  arrowUp: { d: ['M8 12.5v-9', 'M4.5 7 8 3.5 11.5 7'] },
  bell: { d: ['M12.5 6a4.5 4.5 0 1 0-9 0c0 3.1-1.2 4-1.2 4h11.4s-1.2-.9-1.2-4Z', 'M9.3 13.2a1.5 1.5 0 0 1-2.6 0'] },
  board: { d: ['M2.2 2.6h3.2v10.8H2.2z', 'M6.6 2.6h3.2v7.4H6.6z', 'M11 2.6h2.8v9.2H11z'] },
  bug: { d: ['M5 5.5A3 3 0 0 1 11 5.5v3.8a3 3 0 0 1-6 0Z', 'M5 7.5H2.5', 'M13.5 7.5H11', 'M5.3 4 3.6 2.6', 'M10.7 4l1.7-1.4', 'M5.3 11.3 3.6 12.8', 'M10.7 11.3l1.7 1.5'] },
  calendar: { d: ['M2.5 4.3h11v9.2h-11z', 'M2.5 7h11', 'M5.4 2.5v2.4', 'M10.6 2.5v2.4'] },
  check: { d: ['M3 8.4 6.3 11.7 13 5'] },
  checkCircle: { d: ['M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z', 'M5.6 8.2 7.3 9.9 10.6 6.5'] },
  checkSquare: { d: ['M2.6 2.6h10.8v10.8H2.6z', 'M5.5 8.2 7.2 9.9 10.6 6.4'] },
  square: { d: ['M3 3h10v10H3z'] },
  chevronDown: { d: ['M4 6.2 8 10.2l4-4'] },
  chevronRight: { d: ['M6.2 4 10.2 8l-4 4'] },
  close: { d: ['M4 4l8 8', 'M12 4l-8 8'] },
  dot: { d: ['M8 8m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0'], fill: true },
  download: { d: ['M8 2.8v7.4', 'M4.8 7.2 8 10.4l3.2-3.2', 'M2.8 12.8h10.4'] },
  epic: { d: ['M8.8 1.8 3.2 9h4l-.8 5.2L12.8 7h-4l.8-5.2Z'] },
  equals: { d: ['M3.5 6.4h9', 'M3.5 9.6h9'] },
  file: { d: ['M9.2 1.9H4.4a1 1 0 0 0-1 1v10.2a1 1 0 0 0 1 1h7.2a1 1 0 0 0 1-1V5.2Z', 'M9.2 1.9v3.3h3.4'] },
  filter: { d: ['M2.4 3.4h11.2l-4.3 5v4.3l-2.6 1.1V8.4Z'] },
  folder: { d: ['M14 12.4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.6a1 1 0 0 1 1-1h3.1l1.5 1.9H13a1 1 0 0 1 1 1Z'] },
  inbox: { d: ['M14 8.6h-3.2l-1 1.8H6.2l-1-1.8H2', 'M4.3 2.8h7.4l2.3 5.8v3.6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8.6Z'] },
  link: { d: ['M6.8 9.2a2.6 2.6 0 0 0 3.9.3l1.9-1.9a2.6 2.6 0 0 0-3.7-3.7l-1.1 1', 'M9.2 6.8a2.6 2.6 0 0 0-3.9-.3L3.4 8.4a2.6 2.6 0 0 0 3.7 3.7l1.1-1'] },
  list: { d: ['M5.6 4h8.2', 'M5.6 8h8.2', 'M5.6 12h8.2', 'M2.4 4h.01', 'M2.4 8h.01', 'M2.4 12h.01'] },
  lock: { d: ['M3.6 7.2h8.8v6.2H3.6z', 'M5.6 7.2V5.1a2.4 2.4 0 0 1 4.8 0v2.1'] },
  logout: { d: ['M6.2 13.6H3.4a1 1 0 0 1-1-1V3.4a1 1 0 0 1 1-1h2.8', 'M10.2 11.2 13.6 8l-3.4-3.2', 'M13.6 8H6.4'] },
  message: { d: ['M13.6 10a1.2 1.2 0 0 1-1.2 1.2H5.2L2.4 14V3.6a1.2 1.2 0 0 1 1.2-1.2h8.8a1.2 1.2 0 0 1 1.2 1.2Z'] },
  moon: { d: ['M13.4 9.3A5.8 5.8 0 0 1 6.7 2.6a5.8 5.8 0 1 0 6.7 6.7Z'] },
  more: { d: ['M3.4 8h.01', 'M8 8h.01', 'M12.6 8h.01'] },
  paperclip: { d: ['M13.3 7.4 8 12.7a3.3 3.3 0 0 1-4.7-4.7l5.3-5.3a2.2 2.2 0 1 1 3.1 3.1L6.4 11a1.1 1.1 0 1 1-1.6-1.6l4.9-4.8'] },
  plus: { d: ['M8 3.4v9.2', 'M3.4 8h9.2'] },
  search: { d: ['M11.6 7.2a4.4 4.4 0 1 1-8.8 0 4.4 4.4 0 0 1 8.8 0Z', 'M10.6 10.6 13.8 13.8'] },
  settings: { d: ['M10.2 8a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0Z', 'M12.9 9.8a1 1 0 0 0 .2 1.1l.1.1a1.2 1.2 0 1 1-1.7 1.7l-.1-.1a1 1 0 0 0-1.7.7v.2a1.2 1.2 0 1 1-2.4 0v-.1a1 1 0 0 0-1.8-.7l-.1.1a1.2 1.2 0 1 1-1.7-1.7l.1-.1a1 1 0 0 0-.7-1.7h-.2a1.2 1.2 0 1 1 0-2.4h.1a1 1 0 0 0 .7-1.8l-.1-.1a1.2 1.2 0 1 1 1.7-1.7l.1.1a1 1 0 0 0 1.7-.7v-.2a1.2 1.2 0 1 1 2.4 0v.1a1 1 0 0 0 1.8.7l.1-.1a1.2 1.2 0 1 1 1.7 1.7l-.1.1a1 1 0 0 0 .7 1.7h.2a1.2 1.2 0 1 1 0 2.4h-.1a1 1 0 0 0-.9.6Z'] },
  story: { d: ['M4 2.6h8v11l-4-2.6-4 2.6Z'] },
  subtask: { d: ['M4.4 2.8v5.4a1.6 1.6 0 0 0 1.6 1.6h5.6', 'M9.2 7.2l2.6 2.6-2.6 2.6'] },
  sun: { d: ['M10.8 8a2.8 2.8 0 1 1-5.6 0 2.8 2.8 0 0 1 5.6 0Z', 'M8 1.5v1.4', 'M8 13.1v1.4', 'M3.4 3.4l1 1', 'M11.6 11.6l1 1', 'M1.5 8h1.4', 'M13.1 8h1.4', 'M3.4 12.6l1-1', 'M11.6 4.4l1-1'] },
  trash: { d: ['M2.8 4.4h10.4', 'M5.4 4.4V3.2a1 1 0 0 1 1-1h3.2a1 1 0 0 1 1 1v1.2', 'M4.2 4.4v8.4a1 1 0 0 0 1 1h5.6a1 1 0 0 0 1-1V4.4', 'M6.6 7v4', 'M9.4 7v4'] },
  upload: { d: ['M8 10.4V3', 'M4.8 6.2 8 3l3.2 3.2', 'M2.8 12.8h10.4'] },
  users: { d: ['M10.8 13.4v-1.2a2.6 2.6 0 0 0-2.6-2.6H4.6A2.6 2.6 0 0 0 2 12.2v1.2', 'M8.8 5.2a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0Z', 'M14 13.4v-1.2a2.6 2.6 0 0 0-2-2.5', 'M10.4 2.8a2.6 2.6 0 0 1 0 5'] },
};

export type IconProps = {
  name: IconName;
  /** Pixel size; defaults to 16 to sit on the 4px grid. */
  size?: number;
} & Omit<SVGProps<SVGSVGElement>, 'name'>;

export const Icon = ({ name, size = 16, strokeWidth = 1.5, ...rest }: IconProps & { strokeWidth?: number }) => {
  const entry = PATHS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={entry.fill ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {entry.d.map((d) => (
        <path key={d} d={d} fill={entry.fill ? 'currentColor' : 'none'} />
      ))}
    </svg>
  );
};

/** The wordmark. Three bars of increasing height — a board, abstracted. */
export const Logo = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <rect x="1.5" y="6" width="3.4" height="8.5" rx="1.1" fill="currentColor" opacity=".55" />
    <rect x="6.3" y="3" width="3.4" height="11.5" rx="1.1" fill="currentColor" opacity=".8" />
    <rect x="11.1" y="8.2" width="3.4" height="6.3" rx="1.1" fill="currentColor" />
  </svg>
);
