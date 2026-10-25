# Technical Audit and Prioritized Backlog

**Date:** 24 Sep 2026 · **Scope:** whole repository — architecture, frontend, backend, database,
security, QA, documentation.

**Method.** Three independent audits read the source rather than the documentation, and
falsifiable claims were executed rather than reasoned about: the API suite was run, query plans
were taken with `EXPLAIN QUERY PLAN` against the real schema, and three of the findings below
were reproduced end to end against a scratch database before being written down. Findings marked
**[reproduced]** were demonstrated, not inferred.

The project's own documents were treated as claims to test, not as input to trust. Several did
not survive that — recorded in §5.

---

## 1. What is genuinely good

Stating this first because the backlog below is long, and length is not the same as badness.

- **Tenant isolation is real and behaviourally tested.** Twenty cross-tenant routes were probed;
  all twenty returned 404, never 403, so existence is not leaked. The mechanism
  (`rbac/authorize.ts:36-43`) converts a foreign project id into a 404 before any service runs.
- **Authorization is structurally enforced.** `tests/route-coverage.test.ts` walks the live
  Express router and fails the build if a route lacks a permission marker. The eight allowlisted
  exceptions were each checked against their handler and all eight are accurate.
- **Refresh-token rotation is the strongest code in the repository.** A conditional
  `UPDATE … WHERE rotated_at IS NULL` with a `changes` check means two racing refreshes cannot
  both win, and the family revocation commits *outside* the transaction so the error reporting the
  breach cannot roll it back.
- **File uploads are hardened properly.** MIME is sniffed from magic bytes, never trusted from
  the browser; storage paths are built from a server-computed SHA-256 so no user byte reaches the
  filesystem path; downloads are authorised in the service; size is capped twice.
- **Optimistic concurrency is a genuine compare-and-set**, not a read-then-write.
- **Secrets fail closed.** No hardcoded fallback; boot refuses a missing or short secret, and
  refuses placeholder values in production.
- **The design-token rule holds.** 2,573 lines of component CSS contain zero raw spacing or
  font-size values.

---

## 2. P0 — critical, fixed in this pass

| ID | Area | Problem | Files | Verified by |
| --- | --- | --- | --- | --- |
| **P0-1** | Security · multi-tenancy | **[reproduced]** Removing someone from one project unassigned their tasks in *every project in every organisation*. The `UPDATE` had neither a project nor an org predicate. Reachable by the lowest role holding `PROJECT_MEMBER_MANAGE`, silent, unlogged, and it did not move the task version so collaborators' concurrency tokens stayed valid over corrupted data. | `project.service.ts:383` | 2 new tests; confirmed failing against the old code |
| **P0-2** | Correctness · API | **[reproduced]** `/tasks/mine` paginated on `id` while sorting by `(priority, dueDate, id)`. The cursor cut across the sort order. Measured: ten tasks at `limit=3` returned **nine rows, six distinct, four never returned at all**. "My Work" silently hid assigned cards. | `task.repository.ts:53`, `task.service.ts:133` | 1 new test paging a mixed-priority list |
| **P0-3** | Data loss | The column-delete occupancy guard ran *outside* the transaction that performed the delete, while `tasks.column_id` is `ON DELETE CASCADE`. A card created between the count and the delete was destroyed with no error and no audit row. | `board.service.ts:258` | 2 new tests (409 guard, version bump) |
| **P0-4** | Authorization | An org **ADMIN could suspend or evict an OWNER**, locking them out and revoking all their sessions. The rank guard existed in `updateRole` and in neither sibling. | `organization.service.ts:76,91` | 3 new tests |
| **P0-5** | Accessibility | **Keyboard drag-and-drop did not work.** `onKeyDown` declared after `{...listeners}` replaced dnd-kit's KeyboardSensor activator. Cards still announced themselves as draggable to screen readers and read out instructions that did nothing. This is FR-E-06 / NFR-16 and is advertised on the login page. | `TaskCard.tsx:41` | browser suite |
| **P0-6** | Correctness · UI | `LOWEST` priority fell through the lookup and rendered as **"Medium"** — icon, tooltip and visible label. The UI stated the wrong priority. `.prio--lowest` also had no colour rule. | `misc.tsx:135`, `app.css:542` | typecheck + visual |
| **P0-7** | Broken functionality | The task drawer **spun forever** on a failed fetch: `error` was never read, 4xx is not retried, so nothing resolved it and Escape was the only exit with nothing saying so. Reachable from any notification linking to a deleted or inaccessible card. | `TaskDrawer.tsx:66,117` | typecheck + browser suite |
| **P0-8** | Broken functionality | The only two mutations in the codebase with no `onError`. "Mark all read" failing looked exactly like nothing happening. | `NotificationBell.tsx:19,23` | typecheck |

---

## 3. P1 — production readiness

Three of these have since been fixed and verified; see §7. The rest are open and
deliberately listed rather than quietly dropped.

| ID | Area | Problem | Severity | Files | Notes |
| --- | --- | --- | --- | --- | --- |
| P1-1 | Security | **Refresh token (30-day) in `localStorage`.** Server-side handling is excellent, but none of it survives client-side theft. No CSP on the SPA document. | HIGH | `client.ts:25-48` | Needs an `HttpOnly; Secure; SameSite=Strict` cookie scoped to the refresh route, access token in memory, and a full re-test of login/refresh/logout/multi-session/reuse. **Also makes CSRF live**, which it currently is not. |
| P1-2 ✅ | Frontend | **[FIXED — see §7]** **8 screens render a success-shaped empty state on error.** "No projects yet" with a Create button, when the request failed. 12 of 14 `useQuery` sites ignore `error`. | HIGH | Projects, MyWork, Attachments, Comments, NotificationBell, activity rail, sidebar | The dominant failure mode of the app. |
| P1-3 | Frontend | **Server field errors discarded by 7 of 8 forms** — the API returns `details[]`, the UI shows the literal string "Validation failed". `RegisterPage` is the one that does it right. | HIGH | `ProjectsPage:43`, `MembersPage:38`, `useBoard.ts` ×6, others | |
| P1-4 ✅ | Performance | **[FIXED — see §7]** No index on `tasks.board_id`. **[verified]** the board snapshot is a full table scan across all tenants. | HIGH | `schema.ts:214` | One composite index. |
| P1-5 | Correctness | `tasks_path_idx` cannot serve its query — **[verified]** SQLite's default case-insensitive LIKE defeats the prefix optimisation. Every subtree read scans the table. | HIGH | `schema.ts:220` | `case_sensitive_like` pragma, or range comparison. |
| P1-6 | Accessibility | Task drawer declares `aria-modal` with no focus trap, no restore, no scroll lock. Off-canvas sidebar stays in the tab order when closed. | HIGH | `TaskDrawer.tsx:139`, `app.css:2461` | `Modal.tsx` already does this correctly. |
| P1-7 | Robustness | **No error boundary anywhere.** Any render throw blanks the app to white. | HIGH | `app/` | |
| P1-8 ✅ | API | **[FIXED — see §7]** `version` is optional on task update/move; omitting it is a whole-row last-write-wins overwrite built from a snapshot read outside the transaction. | HIGH | `schemas/task.ts:34` | Make it required; express force-write explicitly. |
| P1-9 | Data integrity | Blob refcount drifts and bytes leak on any cascade delete. **[reproduced]** `ref_count` stays 1 after the last attachment is gone. | MEDIUM | `attachment.service.ts:141` | The counter cannot be kept correct while cascades exist. |
| P1-10 | Docs | **Documentation asserts controls that do not exist** — see §5. | MEDIUM | `03-ARCHITECTURE.md` §10, ADR-004 | A reviewer trusting §10 would never look for P1-1. |

## 4. P2 / P3 — improvement and polish

Abbreviated; the full findings are in the audit transcripts.

**P2** — unbounded collections (10 of 14 list endpoints return the whole set, including the board
snapshot); rate limiting is per-IP only, skips successful attempts, and covers 2 of 8 auth routes;
six multi-step writes are not transactional; filesystem write inside a DB transaction; client
errors surfacing as 500; three indexes sorted on `created_at` while their queries sort on `id`;
`loadComment` accepts an `organizationId` and ignores it; logout does not invalidate the access
token (`sid` is minted but never checked); list rows rendered twice; unmemoised `localeCompare`
sort per keystroke; no virtualisation; dropdowns and row components have no responsive handling;
incomplete ARIA tab and menu patterns; `Field` hints not linked with `aria-describedby`.

**P3** — `.link-btn--danger` applied but never defined; `LabelPill` discards the user's chosen
colour; unconfirmed comment and file deletes; `Skeleton` and `InfoNote` are dead code; two dead
indexes and one dead table; `#c2489b` hardcoded; `marginBottom: 4` inline.

---

## 5. Documentation claims that did not survive verification

This section exists because a false claim is worse than a missing one — it stops the next reader
from looking.

| Claim | Where | Reality |
| --- | --- | --- |
| Refresh token on an `HttpOnly; Secure; SameSite=Strict` cookie | `03-ARCHITECTURE.md:349` | **False.** No cookie code exists anywhere. It is in `localStorage`. |
| Rate limiting "per-user on writes" | `03-ARCHITECTURE.md:358` | **False.** No such limiter exists. |
| "Raw SQL prohibited by lint rule" | `03-ARCHITECTURE.md:356` | **False.** There is no ESLint config in the repository. The property holds by discipline; nothing enforces it. |
| "Cursor pagination everywhere" | `pagination.ts:3` | **Overstated.** No offset pagination exists — that half is true — but only 4 of 14 collections are paginated at all. |
| Postgres port is "a driver change plus a regenerated migration set" | ADR-004, `04-DATA-MODEL.md:476` | **Materially overstated.** The table *shapes* are portable; the code is not. 148 synchronous `.get()/.all()/.run()` call sites, 22 synchronous transactions, three `.changes` reads at the concurrency-critical points, 11 `strftime` defaults, `json_extract`, and a two-argument `max()` that is aggregate-only in Postgres. It is an async rewrite of the data layer, not a dialect swap. |
| `npm run lint:tokens` gates the build | `tokens.css:7` | **Was false, now true.** The script did not exist when this audit was written; `scripts/lint-tokens.mjs` was written in the same pass and the rule is now enforced by it. |
| Materialised path gives "one indexed prefix scan" | `04-DATA-MODEL.md` §6.2 | **False in this configuration.** Verified: the plan is a full scan. |

---

## 6. Verification performed in this pass

| | |
| --- | --- |
| API suite | **206 passed** (194 existing + 8 P0 regressions + 2 P1-4 query-plan guards + 2 P1-8 concurrency tests) |
| Browser suite | **26 passed**, no uncaught errors in any of three sessions |
| Error-state suite | **21 passed** — `npm run test:error-states` |
| `tsc --noEmit` | clean across all three workspaces |
| `npm run lint:tokens` | clean |
| Production build | clean |
| P0-1 regression proven | fix reverted → 2 tests fail; fix restored → pass |
| P1-4 guard proven | index migration blanked → query-plan test fails with `SCAN tasks`; restored → pass |
| P1-2 guard proven | `MyWorkPage` error branch reverted → 3 browser assertions fail; restored → pass |

**Not performed, and therefore not claimed:** Lighthouse, bundle analysis, axe, WCAG contrast
measurement, visual regression baselines, Postgres testing, load testing. Those are listed in the
backlog rather than reported as results.

---

## 7. P1 items resolved after this audit

Three P1s were fixed in a later pass. Each was verified by executing the check, and in each
case the new test was proven to fail against the old code before being trusted.

### P1-4 — `tasks.board_id` index

`listForBoard` filters on `board_id` and orders by `(column_id, position)`. The only index that
could help led with `column_id`, so SQLite read **every task row in the database** — every
board, every project, every tenant — and discarded the ones that did not match.

Added `tasks_board_column_pos_idx (board_id, column_id, position)` with migration
`0001_faithful_sheva_callister.sql`. `EXPLAIN QUERY PLAN`, before and after:

```
before:  SCAN tasks USING INDEX tasks_column_position_idx
after:   SEARCH tasks USING INDEX tasks_board_column_pos_idx (board_id=?)
```

`tasks_column_position_idx` was **kept**, contradicting this audit's own note that it was
"fully covered". It is not: `positionsInColumn` and the column-delete count filter on
`column_id` alone, which an index leading with `board_id` cannot serve. Both are covering
index scans today, and `tests/query-plan.test.ts` asserts the plan — not a duration, which on
seeded data would pass either way.

### P1-8 — `version` required on task update and move

Optionality was worse than it looked. The no-version path did not just skip the check: it
rebuilt the row from a snapshot read *outside* the transaction, so a client that merely forgot
the field silently reverted a concurrent writer's edits.

`version` is now required in both `updateTaskSchema` and `moveTaskSchema`; the
`else { repo.bump(...) }` branches are gone and `repo.bump` — whose only purpose was bypassing
the version check — was deleted. Compare-and-set is the only write path that exists. A stale
version returns **409 `VERSION_CONFLICT`** with the current state beside the error so the UI
can show what changed.

This is a **breaking API change**: a client that omits `version` now gets 400 with a field
error. Sixteen existing test call sites had to start sending it, which is exactly the work any
real client must do.

### P1-2 — a failed query is no longer rendered as an empty one

Six screens answered a dropped request with a reassuring sentence about the user's data:
"No projects yet", "All caught up", "Nothing on your plate", "No discussion yet". The
notification bell said "All caught up" while the request was *still in flight*.

Every affected query now distinguishes four states — loading, error, successful-and-empty,
successful-with-data — in `AppShell` (both queries), `ProjectsPage` (both queries),
`NotificationBell`, `MyWorkPage`, `CommentThread` and `AttachmentsPanel`. Errors render
`ErrorState` or `ErrorLine` with a retry that refetches the query rather than reloading the
app. Two smaller lies went with them: the sidebar project count no longer shows `0` when the
list failed to load, and the comment composer is hidden on failure so nobody posts a duplicate
into a thread they cannot see.

`qa/error-states.mjs` (21 assertions) breaks one API call at a time with a 503 and asserts both
halves: that the error and retry appear, **and** that the reassuring sentence is absent.

### Still open

P1-1 (refresh token in `localStorage`), P1-3 (server field errors discarded), P1-5
(`tasks_path_idx` prefix scan), P1-6 (drawer focus management), P1-7 (no error boundary),
P1-9 (blob refcount drift) and P1-10 (documentation claims) are unchanged. P1-10's specific
findings are in §5, where the `lint:tokens` row has since been corrected.
