import { describe, expect, it } from 'vitest';
import { sqlite } from '../src/db/client.js';

/**
 * P1-4 — the board snapshot must be an index SEARCH, not a table SCAN.
 *
 * `listForBoard` filters on board_id and orders by (column_id, position). Until
 * 24 Sep 2026 the only index that could help led with column_id, so SQLite read
 * every task row in the database — every board, every project, every tenant —
 * and discarded the ones belonging to other boards. That is invisible on seed
 * data and linear in total task count in production.
 *
 * Asserting the plan rather than a duration is deliberate: a timing assertion
 * on 35 seeded rows would pass either way, and would be flaky in CI. The plan
 * is the thing that actually changed.
 */
const plan = (sql: string, ...params: unknown[]): string =>
  (sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as Array<{ detail: string }>)
    .map((row) => row.detail)
    .join(' | ');

describe('P1-4 — index coverage for the hot read paths', () => {
  it('serves the board snapshot from tasks_board_column_pos_idx', () => {
    const detail = plan(
      'SELECT * FROM tasks WHERE board_id = ? AND archived_at IS NULL ORDER BY column_id, position',
      'any-board-id',
    );

    expect(detail).toContain('tasks_board_column_pos_idx');
    // SEARCH narrows by the index; SCAN walks the whole table. The distinction
    // is the entire finding.
    expect(detail).toContain('SEARCH');
    expect(detail).not.toContain('SCAN tasks');
  });

  it('still serves the column-only reads, which the board index cannot cover', () => {
    // These are why tasks_column_position_idx was kept rather than replaced:
    // an index leading with board_id is useless to a predicate on column_id
    // alone. The audit note that called it "fully covered" was wrong.
    for (const sql of [
      'SELECT position FROM tasks WHERE column_id = ? ORDER BY position',
      'SELECT count(*) FROM tasks WHERE column_id = ?',
    ]) {
      const detail = plan(sql, 'any-column-id');
      expect(detail).toContain('tasks_column_position_idx');
      expect(detail).not.toContain('SCAN tasks');
    }
  });
});
