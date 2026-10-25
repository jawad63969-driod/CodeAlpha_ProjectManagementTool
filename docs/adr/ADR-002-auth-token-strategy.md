# ADR-002 — Access tokens plus rotating refresh tokens

**Status:** Accepted · **Date:** Sprint 1

## Context
Sessions must be revocable (a deactivated member loses access promptly, FR-B-04) while
request authentication stays stateless enough not to hit the database on every call.
Long-lived tokens in browser storage are a standing theft risk.

## Decision
A 15-minute JWT access token, verified statelessly. A 30-day refresh token stored **hashed**
in `sessions`, rotated on every use. Tokens share a `family_id`; presenting an
already-rotated token is treated as theft and revokes the entire family (FR-A-04).

## Consequences
**Positive** — stolen refresh tokens are detected and neutralised; revocation takes effect
within one access-token TTL; normal reads need no session lookup.
**Negative** — clients must implement silent refresh with request queuing during the
refresh; one extra table and a pruning job.
**Rejected** — long-lived JWT only (unrevocable); server-side sessions for every request
(a database read on every call).
