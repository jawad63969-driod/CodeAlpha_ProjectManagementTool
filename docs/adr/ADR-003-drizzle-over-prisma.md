# ADR-003 — Drizzle ORM in preference to Prisma

**Status:** Accepted · **Date:** Sprint 0

## Context
The project needs typed database access with migrations, and constraint C-01 requires a
reviewer to clone and run it with no special setup.

## Decision
Drizzle ORM.

## Consequences
**Positive** — the schema is ordinary TypeScript, so no code generation step stands between
editing and running. No platform-specific query-engine binary to download, which matters
directly: Prisma's engine host was unreachable from the build environment used for this
project, which would have made the repository unbuildable there. SQL stays visible and
predictable, and the relational query builder solves N+1 (NFR-03) without magic.
**Negative** — a smaller ecosystem than Prisma, and no equivalent of Prisma Studio.
**Rejected** — Prisma (binary download fragility, generation step); TypeORM (decorator-heavy,
weaker inference); raw SQL (no type safety at the boundary).
