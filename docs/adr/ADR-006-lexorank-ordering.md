# ADR-006 — Sparse fractional ranking for board ordering

**Status:** Accepted · **Date:** Sprint 2

## Context
Cards must hold an explicit order within a column, reorder instantly under optimistic UI,
and converge when two people drag at once (FR-E-06).

## Decision
A `REAL` `position` column with sparse initial spacing (1024, 2048, 3072…). Inserting
between two neighbours stores their midpoint. A compaction pass renumbers a column when the
smallest gap falls below a threshold.

## Consequences
**Positive** — a move is a single-row `UPDATE`, so it is fast and safe under concurrency;
two simultaneous moves produce two distinct positions rather than a lost update; the client
can compute the same position locally, which is what makes the optimistic move exact.
**Negative** — floating-point precision eventually exhausts after roughly 50 consecutive
midpoint insertions in the same gap, so compaction is mandatory, not optional; positions are
not human-meaningful.
**Rejected** — integer indexes with renumbering (O(n) writes per move, lost updates under
concurrency); a linked list (`prev_id`/`next_id`) — correct, but every read must walk the
chain and a single broken link corrupts the column.
