# ADR-007 — Refetch on reconnect in preference to an event replay log

**Status:** Accepted · **Date:** Sprint 4

## Context
A client that is briefly disconnected misses events and its cache silently diverges from the
server. Two remedies are standard: buffer events per client and replay on reconnect, or
discard local state and refetch.

## Decision
Refetch on reconnect (FR-J-06). No server-side per-client event buffer in v1.

## Consequences
**Positive** — convergence is guaranteed by construction rather than by the correctness of a
replay implementation; the server holds no per-connection state, so it scales horizontally
without coordination; far less code in the riskiest part of the system (risk R2).
**Negative** — a burst of refetches after a network blip; a brief loading state on the
board; unsuitable for a document editor where every keystroke matters — acceptable for a
board where the authoritative state is small and cheap to re-read.
**Rejected** — per-client event buffers (stateful servers, ordering and expiry edge cases);
CRDTs (the right answer for collaborative text, considerable machinery for a Kanban board).
