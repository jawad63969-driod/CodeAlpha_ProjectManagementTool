# ADR-004 — SQLite for development, PostgreSQL-compatible schema

**Status:** Accepted · **Date:** Sprint 0

## Context
C-01 requires no database server for the reviewer; the architecture must still be credible
for production, where SQLite's single-writer model would be the bottleneck.

## Decision
One Drizzle schema, restricted to constructs both engines support. SQLite in WAL mode for
development and the internship deliverable; PostgreSQL 16 for production, selected by
`DATABASE_URL`.

## Recorded divergences
| Concern | SQLite | PostgreSQL |
| --- | --- | --- |
| Enums | `TEXT` + `CHECK` | native `ENUM` |
| Booleans | `INTEGER 0/1` | `boolean` |
| Timestamps | ISO-8601 `TEXT`, always UTC | `timestamptz` |
| JSON columns | `TEXT`, parsed in the repository | `jsonb` |
| Partial indexes | supported | supported |
| Case-insensitive email | stored lowercased at write time | stored lowercased at write time (portable, not `citext`) |

## Consequences
**Positive** — clone-and-run; the same queries, indexes and transactions exercised in tests
are the ones that run in production.
**Negative** — no engine-specific features (no `jsonb` operators, no full-text search in v1);
concurrency characteristics differ, so load testing must happen against Postgres.
**Rejected** — Postgres-only with Docker (setup burden, and undebuggable in the build
environment used here); an abstraction layer over two hand-written schemas (double maintenance).
