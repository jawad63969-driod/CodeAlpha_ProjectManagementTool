# ADR-001 — Monorepo with a shared contracts package

**Status:** Accepted · **Date:** Sprint 0 · **Deciders:** Architect

## Context
The API and the web client must agree on request shapes, response shapes, permission names
and socket event payloads. In two separate repositories that agreement is maintained by
discipline and discovered to be broken by users.

## Decision
One npm-workspaces monorepo: `apps/api`, `apps/web`, `packages/shared`. The shared package
exports Zod schemas, the types inferred from them, the permission catalogue and the typed
socket event map. Both applications import it; neither redefines a type the other owns.

## Consequences
**Positive** — an API change that the client has not handled is a compile error. OpenAPI is
generated from the same schemas, so documentation cannot drift. One `npm install`, one test
command, atomic cross-cutting commits.
**Negative** — TypeScript project references must be configured correctly or editor
performance suffers; the two apps are versioned together.
**Rejected** — separate repos with a published types package (release friction on every
change); duplicated types (guaranteed drift).
