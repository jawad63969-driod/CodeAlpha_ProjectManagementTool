const parse = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const relativeTime = (value: string | null | undefined): string => {
  const date = parse(value);
  if (!date) return '';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (days < 30) return `${Math.round(days / 7)} week${days >= 14 ? 's' : ''} ago`;
  return date.toLocaleDateString();
};

export const formatDate = (value: string | null | undefined): string => {
  const date = parse(value);
  return date ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
};

/** Due-date badge state: overdue, today, soon or simply scheduled. */
export const dueState = (dueDate: string | null): { tone: string; label: string } | null => {
  if (!dueDate) return null;
  const due = new Date(`${dueDate}T23:59:59`);
  const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { tone: 'overdue', label: `Overdue by ${Math.abs(days)}d` };
  if (days === 0) return { tone: 'today', label: 'Due today' };
  if (days <= 3) return { tone: 'soon', label: `Due in ${days}d` };
  return { tone: 'later', label: new Date(dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) };
};
