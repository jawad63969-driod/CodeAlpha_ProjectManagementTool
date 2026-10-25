import { z } from 'zod';

/**
 * Offset pagination is banned in this codebase: under concurrent inserts it
 * silently skips and repeats rows. Nothing here uses it.
 *
 * "Cursor pagination everywhere" would be an overstatement, so it is not made:
 * the paginated collections are /tasks/mine, /notifications and the three
 * activity feeds. Project lists, board snapshots, comments, attachments,
 * subtasks and member lists are currently unbounded — see backlog P2 in
 * docs/06-AUDIT-AND-BACKLOG.md.
 *
 * A cursor must encode the FULL sort key of the query it paginates. Encoding
 * only the row id while ordering by something else drops and repeats rows;
 * that was a real defect in /tasks/mine (P0-2).
 */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}
