import type { Page } from '@taskforge/shared';

/** Builds a cursor page from rows that carry a sortable `id`. */
export const toPage = <T extends { id: string }>(rows: T[], limit: number): Page<T> => {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data.at(-1);
  return { data, nextCursor: hasMore && last ? last.id : null };
};

/** SQLite stores timestamps as ISO text; this normalises anything we read back. */
export const toIso = (value: string | Date | null | undefined): string | null => {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
};

export const nowIso = (): string => new Date().toISOString();
