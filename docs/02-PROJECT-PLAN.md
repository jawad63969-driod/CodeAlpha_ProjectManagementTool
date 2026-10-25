# Project Plan, Estimation & Delivery Schedule — TaskForge

| | |
| --- | --- |
| **Version** | 1.0 |
| **Status** | Awaiting sign-off |
| **Method** | Scrum-inspired, 1-week sprints, single-engineer team |
| **Baseline** | 6 sprints · 34 working days · ≈ 186 engineering hours |

---

## 1. Delivery approach

A single engineer delivers the platform in six one-week sprints. Each sprint ends with a
**demonstrable, deployed-able increment** — never a half-integrated layer. The rule applied
throughout: *a sprint that cannot be demoed did not happen.*

**Estimation basis.** Work is sized in story points on a modified Fibonacci scale
(1, 2, 3, 5, 8, 13), then converted to hours using an observed rate of **1 point ≈ 1.6 h**
for this stack. Points measure complexity and uncertainty; hours are the derived planning
figure. A 20 % contingency buffer is held at programme level, not inside individual estimates —
padding every task hides risk.

**Capacity.** 6 focused hours/day × 5 days = **30 h/sprint**, ≈ 19 points/sprint.

---

## 2. Work breakdown structure

### Sprint 0 — Foundations *(16 pts · 26 h)*

| ID | Work package | Pts | Hrs | Depends on |
| --- | --- | --- | --- | --- |
| S0.1 | Monorepo: npm workspaces, `apps/api`, `apps/web`, `packages/shared` | 2 | 3 | — |
| S0.2 | TypeScript project references, strict config, path aliases, ESLint + Prettier | 3 | 5 | S0.1 |
| S0.3 | Drizzle ORM setup, migration tooling, connection lifecycle, transaction helper | 3 | 5 | S0.1 |
| S0.4 | Express app skeleton: error envelope, request ID, structured logging, Helmet, CORS | 3 | 5 | S0.2 |
| S0.5 | Zod-first validation middleware + OpenAPI generation | 3 | 5 | S0.4 |
| S0.6 | Test harness: Vitest, isolated DB per run, factories, seed script | 2 | 3 | S0.3 |

**Exit criteria:** `npm run dev` boots API and web; `/healthz` returns 200; one migration applied; one passing integration test.

### Sprint 1 — Identity, tenancy and RBAC *(19 pts · 30 h)*

| ID | Work package | Pts | Hrs | Depends on |
| --- | --- | --- | --- | --- |
| S1.1 | Schema: organisations, users, memberships, sessions, invitations | 3 | 5 | S0.3 |
| S1.2 | Registration, login, bcrypt, access + refresh token issuance | 3 | 5 | S1.1 |
| S1.3 | Refresh rotation with reuse detection and session families | 5 | 8 | S1.2 |
| S1.4 | RBAC policy engine: permission catalogue, role matrix, `authorize()` guard | 5 | 8 | S1.1 |
| S1.5 | Invitations: create, accept, revoke, expiry | 2 | 3 | S1.4 |
| S1.6 | Tenant-isolation test suite | 1 | 1 | S1.4 |

**Exit criteria:** FR-A-01…08, FR-B-01…06, FR-C-01…04 green; isolation suite proves no cross-tenant read.

### Sprint 2 — Projects, boards and the work-item core *(21 pts · 34 h)*

| ID | Work package | Pts | Hrs | Depends on |
| --- | --- | --- | --- | --- |
| S2.1 | Schema: projects, project_members, boards, workflow_statuses, columns, labels | 3 | 5 | S1.1 |
| S2.2 | Project CRUD + default board/status/column provisioning | 3 | 5 | S2.1 |
| S2.3 | Board and column configuration, reordering, WIP limits | 3 | 5 | S2.2 |
| S2.4 | Schema + service: work items, per-project sequence, lexo-rank ordering | 5 | 8 | S2.1 |
| S2.5 | Work-item CRUD, move endpoint, optimistic concurrency (`version`) | 5 | 8 | S2.4 |
| S2.6 | Labels, watchers, filtering and cursor pagination | 2 | 3 | S2.4 |

**Exit criteria:** FR-D, FR-E, FR-F-01…04, FR-F-09…14 green; 500-item board queried without N+1.

### Sprint 3 — Hierarchy, collaboration and audit *(20 pts · 32 h)*

| ID | Work package | Pts | Hrs | Depends on |
| --- | --- | --- | --- | --- |
| S3.1 | Subtask hierarchy: `path`, depth cap, cycle prevention, re-parenting | 5 | 8 | S2.4 |
| S3.2 | Subtask aggregation (done/total) without N+1 | 2 | 3 | S3.1 |
| S3.3 | Threaded comments, edit/delete rules, @mention resolution | 5 | 8 | S2.5 |
| S3.4 | Attachments: hashed blob store, de-duplication, permissioned download, GC | 5 | 8 | S2.5 |
| S3.5 | Activity log written transactionally with every mutation | 3 | 5 | S2.5 |

**Exit criteria:** FR-F-05…08, FR-G, FR-H, FR-I-01…04 green; failure-injection test shows no mutation without its audit row.

### Sprint 4 — Real-time layer and notifications *(17 pts · 27 h)*

| ID | Work package | Pts | Hrs | Depends on |
| --- | --- | --- | --- | --- |
| S4.1 | Socket.IO gateway, token auth at handshake, room registry | 3 | 5 | S1.2 |
| S4.2 | Typed event bus; services emit through one publisher | 5 | 8 | S3.5 |
| S4.3 | Subscription authorization + presence | 3 | 5 | S4.1 |
| S4.4 | Notification generation, delivery and read state | 3 | 5 | S4.2 |
| S4.5 | Two-client realtime integration suite | 3 | 4 | S4.2 |

**Exit criteria:** FR-J-01…06, FR-I-05…06 green; two headless clients observe each other's mutations < 200 ms.

### Sprint 5 — Web client *(24 pts · 38 h)*

| ID | Work package | Pts | Hrs | Depends on |
| --- | --- | --- | --- | --- |
| S5.1 | Design system: tokens, primitives, light/dark, layout shell | 3 | 5 | S0.1 |
| S5.2 | Typed API client + TanStack Query cache, auth flow with silent refresh | 5 | 8 | S2.5 |
| S5.3 | Socket provider, cache reconciliation, self-echo suppression | 5 | 8 | S4.2 |
| S5.4 | Kanban board: dnd-kit, optimistic move, keyboard drag alternative | 5 | 8 | S5.3 |
| S5.5 | List view, filters, saved view state | 2 | 3 | S5.2 |
| S5.6 | Task detail: fields, subtask tree, comments, attachments, activity | 5 | 8 | S5.2 |
| S5.7 | Admin surfaces: members, roles, invitations, project settings | 3 | 5 | S5.2 |
| S5.8 | Notification centre, presence, My Work | 2 | 3 | S5.3 |

> Sprint 5 is over capacity at 30 pts of demand against 19 pts of supply. Resolution in §4.

### Sprint 6 — Hardening and handover *(14 pts · 22 h)*

| ID | Work package | Pts | Hrs | Depends on |
| --- | --- | --- | --- | --- |
| S6.1 | Playwright E2E: multi-user realtime, RBAC matrix, drag-and-drop | 5 | 8 | S5.4 |
| S6.2 | Accessibility pass (axe-core, focus management, keyboard paths) | 3 | 5 | S5.4 |
| S6.3 | Performance pass: query plans, indexes, bundle budget | 3 | 5 | S5.4 |
| S6.4 | Documentation, OpenAPI publish, seed narrative, demo script | 3 | 4 | all |

---

## 3. Dependency graph and critical path

```
S0 Foundations
   └─▶ S1 Identity + RBAC ──┬─▶ S2 Projects/Boards/Items ──┬─▶ S3 Hierarchy/Collab/Audit
                            │                              │        │
                            │                              │        └─▶ S4 Realtime ──┐
                            │                              └─▶ S5.2 API client        │
                            └─▶ S4.1 Socket auth                                      │
                                                                                      ▼
                                                    S5 Web client ──▶ S6 Hardening ──▶ Release
```

**Critical path:** `S0.3 → S1.1 → S1.4 → S2.1 → S2.4 → S2.5 → S3.5 → S4.2 → S5.3 → S5.4 → S6.1`
≈ **78 h**. Everything on this path is schedule-determining; anything off it can absorb delay.

**Parallelisable off the critical path:** S5.1 (design system) can start during Sprint 0,
S6.4 (documentation) runs continuously, S3.4 (attachments) is independent of the realtime work.

---

## 4. Capacity reconciliation

Total demand: **131 points ≈ 209 h**. Supply across six sprints: **114 points ≈ 180 h**.
The gap is real and is resolved deliberately rather than by optimism:

| Action | Effect |
| --- | --- |
| Move S5.5 (List view) and S5.7 (Admin surfaces) into Sprint 6 | −5 pts from Sprint 5 |
| Drop FR-E-05 (WIP limits) and FR-H-05 (typing indicators) to *Should* — build only if Sprint 6 has slack | −3 pts |
| Defer FR-F-13 shareable filter URLs to post-v1 | −2 pts |
| Sprint 5 runs at 24 pts against 19 supply — accepted overtime, flagged as the schedule's riskiest week | +5 pts carried |

Rebalanced plan: **121 points ≈ 194 h**, plus a 20 % programme buffer → **≈ 233 h worst case**.
The buffer exists to be spent; if it is untouched, the *Could* items above return to scope.

---

## 5. Milestones

| ID | Milestone | Ends | Exit criteria | Demo |
| --- | --- | --- | --- | --- |
| **M0** | Walking skeleton | Sprint 0 | Boots, migrates, one green test | `/healthz` + empty app shell |
| **M1** | Secure multi-tenant core | Sprint 1 | FR-A, FR-B, FR-C green; isolation proven | Two orgs, cross-access refused |
| **M2** | Work management API complete | Sprint 2 | FR-D, FR-E, FR-F core green | Board driven entirely from REST calls |
| **M3** | Collaboration complete | Sprint 3 | FR-F-05…08, FR-G, FR-H, FR-I green | Subtask tree + threaded comments + audit trail |
| **M4** | Live platform | Sprint 4 | FR-J green | Two API clients syncing in real time |
| **M5** | Feature complete | Sprint 5 | All *Must* requirements have UI | Full product walkthrough |
| **M6** | Release candidate | Sprint 6 | E2E, a11y and perf gates pass; docs published | Recorded demo, tagged release |

---

## 6. Risk register

| # | Risk | L | I | Exposure | Mitigation | Trigger / owner |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | Sprint 5 overload causes a half-finished UI | H | H | **Critical** | Build the board vertically (one complete feature at a time), deferrable items already identified in §4 | >2 days behind at Sprint 5 mid-point |
| R2 | Realtime cache reconciliation produces duplicate or ghost cards | M | H | High | Single reducer for socket events, self-echo suppression by actor ID, refetch-on-reconnect (FR-J-06), two-client test in CI from Sprint 4 | Any duplicate observed in test |
| R3 | Drag-and-drop accessibility under-delivered | M | M | Medium | dnd-kit chosen specifically for its keyboard sensor; a11y in the Sprint 6 gate, not a nice-to-have | axe violation at Sprint 5 review |
| R4 | SQLite semantics diverge from Postgres and bite at migration time | M | M | Medium | Drizzle schema restricted to portable types; no SQLite-specific SQL; ADR-004 records every divergence | Any raw SQL entering the codebase |
| R5 | Lexo-rank positions collapse under heavy reordering | L | M | Low | Compaction job when neighbour gap < threshold; property test with 10 000 random moves | Gap threshold breached in test |
| R6 | Scope creep from "enterprise" framing | H | M | High | §7 of the SRS is a closed list; anything new requires an SRS amendment | Any request not traceable to an FR ID |
| R7 | Full rebuild does not finish before the internship deadline | M | H | High | **v1 is archived and submission-ready** — cut over only when v2 passes its gates | M4 not met on schedule |
| R8 | Attachment de-duplication GC deletes a referenced blob | L | H | Medium | Reference counting inside the deletion transaction; restore test in the suite | — |

*L = likelihood, I = impact.*

---

## 7. Definition of Ready / Definition of Done

**Ready** — a work package may start only when it: traces to an FR ID; has acceptance
criteria expressible as a test; has its schema impact identified; and has no unresolved
dependency on unstarted work.

**Done** — a work package is complete only when **all** hold:

- [ ] Implemented behind the layered architecture (no controller touching the database)
- [ ] Zod schema at the boundary; types shared, not duplicated
- [ ] Unit tests on the service; integration test on the endpoint
- [ ] Permission check declared and covered by the RBAC test matrix
- [ ] Activity row written in the same transaction, where the operation mutates
- [ ] Real-time event emitted and asserted, where the operation is user-visible
- [ ] `tsc --noEmit`, ESLint and the full test suite pass
- [ ] No N+1 introduced (query-count assertion where a list is involved)
- [ ] Documentation and OpenAPI regenerated

---

## 8. Governance

| Cadence | Activity | Output |
| --- | --- | --- |
| Daily | Progress check against the sprint board | Blockers surfaced within 24 h |
| Sprint end | Demo + retrospective | Increment demoed; velocity recalibrated |
| Sprint end | Risk register review | Exposure re-scored; mitigations adjusted |
| Milestone | Gate review against exit criteria | Go / no-go; M4 is the go/no-go for cutting over from v1 |

**Change control.** Any change to scope updates the SRS first and the plan second. An
estimate is never revised silently — a slipped estimate is recorded with its cause so the
next estimate is better.

---

## 9. Re-baseline — 2025-09-22 (two-week delivery window)

**Trigger.** Risk **R7** materialised at planning time: the CodeAlpha submission window is
approximately **two weeks**, not six. The six-sprint baseline in §2 is unachievable. Re-planned
rather than re-estimated — the original estimates were not wrong, the calendar changed.

**New shape:** four 1-week-equivalent sprints, **~120 h supply** against a **194 h** baseline
demand. The 74 h gap is closed by explicit descoping, listed below, not by optimism.

### 9.1 Compressed sprint plan

| Sprint | Contents | Demo at the end |
| --- | --- | --- |
| **A — Foundation & Identity** | S0.1–S0.6, S1.1–S1.4, S1.6 | Two orgs, RBAC enforced, cross-tenant access refused |
| **B — Work management core** | S2.1–S2.6, S3.1–S3.2, S3.4 | Boards, tasks, subtask trees, attachments over REST |
| **C — Collaboration & realtime** | S3.3, S3.5, S4.1–S4.5 | Two clients syncing live; threads, audit trail, notifications |
| **D — Client & hardening** | S5.1–S5.8 (reduced), S6.1, S6.4 | Full product walkthrough in the browser |

### 9.2 Descoped — with the reasoning

| Removed / reduced | Was | Justification |
| --- | --- | --- |
| Invitation token flow (FR-B-02, 03) | 3 pts | Replaced by direct add-by-email, which an org admin can already do. Token acceptance is a nicety, not a capability. |
| Session list and per-session revoke (FR-A-07) | 2 pts | *Should*, not *Must*. Rotation and reuse detection — the security-relevant parts — stay. |
| WIP limits (FR-E-05) | 2 pts | Already marked *Should* in §4. |
| Typing indicators (FR-H-05) | 2 pts | Already marked *Should* in §4. |
| OpenAPI generation | 3 pts | Replaced by a hand-curated `docs/05-API.md`. The Zod schemas remain the single source of truth for validation and types; only the published artefact changes. |
| Idempotency keys, bulk endpoints | 3 pts | No client path in v1 exercises them. |
| Server-persisted board preferences | 2 pts | Moved to `localStorage`. Table stays in the schema. |
| Accessibility gate → accessibility pass | 3 pts | Keyboard drag alternative and focus management stay (they are in dnd-kit); the automated axe gate is dropped. |
| Playwright a11y + perf suites | 3 pts | Functional multi-user E2E is retained; it is the one that proves the brief. |

**Retained in full — the user's stated Phase 3 requirements are non-negotiable:**
advanced auth + RBAC (Admin / Project Manager / Developer), Kanban **and** List views with
drag-and-drop across `Backlog → In Progress → Code Review → Done`, priorities, due dates,
assignees, **multi-level subtasks**, **file attachments**, threaded discussion with an
**activity audit trail**, and **real-time WebSocket sync**.

### 9.3 Standing fallback

v1 (TeamFlow) is archived, tested and submission-ready at
`CodeAlpha_ProjectManagementTool_v1/`. The cut-over decision point is the end of **Sprint C**:
if the realtime layer is not green by then, v1 is submitted and TaskForge continues as a
portfolio project. This is a planned decision, not a failure mode.

---

## 10. Sprint A record — foundation, identity, tenancy, RBAC

**Status: complete.** 76 automated assertions, all green; strict `tsc` clean; 20 tables, 37 indexes.

| Work package | Outcome |
| --- | --- |
| S0.1–S0.6 Foundations | Monorepo with a shared contracts package, strict TS, Drizzle + migrations, Express edge with correlation ids and a uniform error envelope, isolated-database test harness |
| S1.1 Identity schema | organizations, users, organization_members, sessions |
| S1.2 Registration & login | bcrypt cost 12, personal workspace provisioned on sign-up, timing-equalised credential failures |
| S1.3 Refresh rotation | Rotating refresh tokens, hashed at rest, with reuse detection and family revocation |
| S1.4 RBAC engine | Permission catalogue, org × project matrix, `authorize()` guard, machine-checked route coverage |
| S1.5 Membership | Direct add-by-email, role changes, suspension, removal, last-owner protection |
| S1.6 Isolation suite | 9 assertions covering data, existence leakage and cross-tenant side effects |

### Defects found by the tests, before any of it shipped

Recorded because they are the reason the suite exists.

**1 — Reuse detection was self-cancelling.** The family revocation ran inside the rotation
transaction, and the `throw` that reported the breach rolled it straight back: the attack was
detected and then silently forgiven. The transaction now *returns* reuse as a value; the
revocation commits on its own before the error is raised. The rotation itself became a
conditional `UPDATE ... WHERE rotated_at IS NULL`, so two refreshes racing on one token cannot
both win.

**2 — Sessions were not scoped to a workspace.** `sessions` carried no `organization_id`, with
two consequences: a refresh resolved the workspace by picking the caller's first active
membership, so refreshing a token could silently relocate someone to a different tenant; and
suspending a person in one workspace revoked every session they had anywhere. Fixed by adding
`organization_id` to `sessions`, pinning refresh to the originating workspace, and scoping
revocation with `revokeForUserInOrganization`. Both behaviours are now regression-tested.

**3 — A router-level guard turned 404 into 401.** `router.use(authenticate)` applied to every
path under the mount point, so an unknown URL answered "unauthenticated" instead of "not found",
which is itself a small information leak. Guards are now declared per route.

### Deviation from the plan

The `sessions` fix required a schema change after the first migration was generated. Because
SQLite cannot add a `NOT NULL` column to a populated table, shipping `0000 + 0001` would have
handed anyone with existing data a broken upgrade. Nothing is released, so the baseline was
regenerated as a single migration. The forward-only rule in §8 applies from the first release,
which has not happened yet.

---

## 11. Sprint B record — projects, boards, work items, hierarchy, attachments

**Status: complete.** 156 automated assertions, all green; strict `tsc` clean.

| Work package | Outcome |
| --- | --- |
| S2.1–S2.2 Projects | CRUD, key derivation with collision handling, archive/restore, visibility by org role and project membership |
| S2.2 Provisioning | Creating a project transactionally provisions a default board, four statuses and four columns (FR-D-02) |
| S2.3 Board config | Multiple boards per project, column create/rename/reorder/delete with a mandatory destination for occupied columns |
| S2.4–S2.5 Work items | `KEY-N` references from an atomic counter, lexo-rank ordering, move endpoint, optimistic concurrency |
| S2.6 Labels & watchers | Project-scoped labels, implicit watchers on reporter and assignee, cursor-paginated My Work |
| S3.1–S3.2 Hierarchy | Materialised-path subtasks, 5-level cap, cycle prevention, subtree re-parenting, aggregate progress |
| S3.4 Attachments | Content-addressed blobs with reference counting, byte-level MIME sniffing, permissioned download |
| S3.5 (partial) Audit | `recordActivity` writes in the same transaction as every mutation, ready for the Sprint C feed |

### Defects found by the tests

**4 — A correlated subquery silently matched nothing.** Drizzle renders `projects.id`
as a bare `"id"` when a query has no join. Inside a correlated subquery that binds to the
*subquery's* own `id` column, so the caller's project role always came back null. Fixed by
qualifying the outer column explicitly. The lesson is generalisable: an ORM's column
reference is context-sensitive, and a correlated subquery is exactly where that bites.

**5 — `RESTRICT` foreign keys made project deletion impossible.** `board_columns.status_id`
and `tasks.column_id` were `RESTRICT`, so deleting a project produced a 500: SQLite reaches
the cascade targets in an order we cannot control. Changed to `CASCADE`, with "you must say
where these cards go" enforced in the service, where it can answer with a 409 and a list of
destinations instead of an opaque constraint failure. **Business rules belong in services;
constraints exist to protect integrity, not to express policy.**

**6 — `CASCADE` delete did not cascade.** The self-referencing `tasks.parent_task_id` was
`SET NULL`, which quietly defeated the CASCADE strategy — children were orphaned rather than
deleted. Changed to `CASCADE`; the REPARENT strategy is unaffected because it moves children
onto their grandparent *before* the parent row is removed.

**7 — Route guards without a project resolver denied legitimate access.** Routes keyed on a
globally unique id (`/columns/:columnId`, `/attachments/:attachmentId`) evaluated only
org-level grants, so a project manager who was merely a workspace *member* was refused.
Added `fromColumn`, `fromTask` and `fromAttachment` resolvers so the guard always has the
project scope it needs.

**8 — The error envelope was being polluted.** Version-conflict responses merged their
payload into `error`, widening the shape the architecture document fixes. Extra context now
travels beside the error, not inside it.

---

## 14. Sprint D record — the client

**Status: complete.** 194 API assertions + 26 browser assertions = **220 passing, 0 failing.**
Strict `tsc` clean across all three workspaces.

> Figures in this and every sprint record below are **as at the close of that sprint**. The
> current totals are in §16; `npm test` prints 206 today, not 194, because the P0 and P1 passes
> added tests after this sprint closed.

| Work package | Outcome |
| --- | --- |
| S5.1 Design system | Token-driven CSS, light and dark, responsive to 360 px, no UI kit |
| S5.2 API client | Typed endpoints, silent refresh with a single-flight guard, field-level form errors |
| S5.3 Realtime reconciliation | One reducer patches the query cache, suppresses self-echo, refetches on reconnect |
| S5.4 Kanban | dnd-kit with pointer **and** keyboard sensors, optimistic move with rollback |
| S5.5 List view | Same data, indented by subtask depth |
| S5.6 Task drawer | Inline fields, labels, subtask tree with progress, threaded comments, files, history |
| S5.7 Admin surfaces | Workspace members with role changes, project switcher, column configuration |
| S5.8 Notifications | Live badge, feed, mark-one and mark-all |
| S6.1 Browser E2E | Three users in three contexts: live create, real drag, live notification, viewer lockout |

### Defect found by the browser

**10 — An infinite render loop from a Zustand selector.** `usePresence((s) => s.viewers[id] ?? [])`
returns a *new array* whenever the key is absent, so `useSyncExternalStore` saw a changed
snapshot on every render and React looped until it threw "Maximum update depth exceeded". The
board rendered as a blank page. Fixed by selecting the value and falling back to a
module-level constant, so the reference is stable.

Worth noting **how** it was found: the API suite was entirely green, `tsc` was clean, and the
production build succeeded. Only a real browser, driven end to end, surfaced it — which is the
argument for the browser suite existing at all.

### Verified in the browser, not just asserted in prose

- A card created by one user appears on another user's board with no refresh.
- A real pointer-driven drag between columns is mirrored live to the second user.
- Assigning a task pushes a live notification badge to the assignee.
- A viewer sees the board, gets no composer, and is told it is read-only.
- No uncaught JavaScript errors in any page, across all three sessions.

---

## 15. Sprint E — interface rebuild (24 Sep 2026)

**Trigger:** not planned. The client rejected the Sprint D interface outright — *"3rd class UI"* —
and asked for a diagnosis before any fix. That sequence turned out to matter: the audit is what
found the root causes, and fixing symptoms first would have left every one of them in place.

### 15.1 What the audit found

`docs/05-UI-AUDIT.md` — 60 defects (9 critical, 18 high, 24 medium, 9 low) across eight screens,
all tracing to five root causes. The most damaging was not a defect at all but a **false comment**:
`app.css` opened by claiming a design system it did not have. Measured, the stylesheet defined
zero spacing tokens and zero type tokens against 16 raw gap values and 18 raw font sizes,
including half-pixel sizes — the signature of nudging by eye. The claim is why nobody, myself
included, looked closer for a whole sprint.

### 15.2 Where the process failed

Sprint D verified the interface **functionally** — 26 browser assertions, no uncaught errors —
and I treated green tests as evidence of quality. A passing assertion proves a button works. It
says nothing about whether the screen is worth looking at. Every one of the 60 findings was
present while the suite was green.

This is the same lesson as defect 10 in §14, arriving from the other direction. There, tests
passed and a real browser found the bug. Here, the browser suite passed and only a person
looking at the result found the problem. **Each layer of verification is blind to the layer
above it**, and the layer above the browser suite is judgement, which was not being applied.

### 15.3 What was built

| | |
| --- | --- |
| Tokens | `tokens.css` — 4px space grid, 7-step type scale, both themes from one set |
| Reset | `base.css` — every interactive element; no OS chrome reaches the page |
| Icons | `Icon.tsx` — 41 inline SVG glyphs, `currentColor`, replacing 12 emoji |
| Primitives | Button, IconButton, Field, Tabs, Section, Priority, StatusPill, EmptyState, Skeleton |
| Shell | A real sidebar; board columns that stretch and scroll independently |
| Seed | Rewritten: honest descriptions, per-project numbering, back-dated history |

### 15.4 Defects this sprint caught

1. **Per-project numbering was broken** — `project === platform ? sequence : sequence`, the same
   branch twice, so the second project's board opened at `MOB-14`.
2. **Back-dating rows broke id ordering** — ids encode insertion time and the feed sorts by id,
   so realistic timestamps scrambled the feed and React threw a duplicate-key warning. Caught by
   the browser suite's uncaught-error assertion. Fixed with `newIdAt`.
3. **`.sr-only` was never defined** — the read-only notice was *meant* to be screen-reader-only.
   A utility class present in markup but absent from CSS fails silently and visibly.
4. **A blanket responsive rule hid the avatar** — `.menu__trigger span { display: none }` on a
   phone left the account menu as a bare chevron.

### 15.5 Gate

*As at the close of Sprint E.*

| | |
| --- | --- |
| API suite | 194 passing |
| Browser suite | 26 passing, no uncaught errors |
| `tsc --noEmit` | clean, three workspaces |
| Production build | 471 kB JS / 148 kB gzip · 45 kB CSS / 8 kB gzip |
| Screenshots | re-captured from clean seed data by `npm run shots` |

### 15.6 Carried forward

Three gaps are recorded in §6.5 of the audit rather than closed: no visual regression testing,
no build gate enforcing the token rule, and dark-mode contrast separated by eye rather than
measured. All three are cheap to add and none is on the critical path to submission.

### 15.7 Follow-up — horizontal space

Reported immediately after §15 shipped: the rebuilt UI wasted the right-hand side of a desktop
display. Verified and fixed; measurements and the three causes are in §6.6 of the audit.

The process failure is worth naming, because it is the same shape as §15.2 one level down.
Sprint E replaced "tests pass, therefore it is good" with "I looked at it, therefore it is
good" — but I looked at it at exactly one viewport, 1440px, which happens to be the width where
a 1120px container still looks deliberate. **Judgement applied at a single sample is not much
better than no judgement at all.**

`qa/widths.mjs` now reports content width as a percentage of viewport at 1366, 1600, 1920 and
2560, so the next regression is a number rather than a matter of taste. It is not yet a build
gate; that is listed with the other three open items in §6.5.

### 15.8 Follow-up — the update that did not arrive

Reported after §15.7 shipped: `npm run setup && npm run dev` on a machine that had run the
project before showed the old two-project data *and* the old layout. Neither was a code
problem — the source on disk was correct. Two separate pieces of tooling were hiding it.

**1 · Setup reported success while changing nothing.** `npm run seed` refuses to touch a
database that already has users, which is right. But `setup.mjs` called it unconditionally, so
the refusal — `Database already contains users — nothing to seed` — landed in the middle of a
long `npm install` log and was followed by `Setup complete.` A command whose entire job is to
produce a known-good state was reporting success for a state it had not produced.

Setup now fingerprints `seed.ts` and compares it against a stamp written beside the database.
A hash rather than a version number, so changing the demo data is enough to invalidate an old
database and nobody has to remember to bump anything. Four paths, all verified: fresh clone
seeds, unchanged database is a no-op, stale database is wiped and rebuilt with a reason given,
`--keep-data` opts out.

**2 · Vite moved to another port and said so quietly.** `server.port: 5173` without
`strictPort` means Vite takes 5174 when 5173 is busy. A dev server left running from an earlier
session therefore kept serving the old bundle — and the old API on :4000 — at exactly the
address the browser had open. Every symptom of "my changes do nothing", with nothing in the
output to explain it.

`strictPort: true` now, plus a preflight in `dev.mjs` that checks both ports before starting
anything and prints the platform-specific command to free them. `dev.mjs` also aborts the whole
run when any child exits non-zero, instead of letting one dead server scroll past in the other
two's output.

**What this one is really about.** §15.2 and §15.7 were both about verification being blind one
level up. This is different: the code was right and the tests were right, and the user still
could not get at either. **A correct build the user cannot reach is indistinguishable from a
broken one** — and the tooling was not just failing to help, it was actively reporting success.
Every path that can leave someone on stale state now says so in words.

---

## 16. Current state — 25 Oct 2026

The sprint records above are closed and left as written. This is where the project actually
stands, and every figure here was produced by running the command named beside it.

| Check | Command | Result |
| --- | --- | --- |
| API suite | `npm test` | **206 passed**, 17 files |
| Browser suite | `npm run test:e2e` | **26 passed**, three simultaneous users |
| Error-state suite | `npm run test:error-states` | **21 passed** |
| **Total** | | **253 passing, 0 failing** |
| Types | `npm run typecheck` | clean, three workspaces |
| Design tokens | `npm run lint:tokens` | clean |
| Production build | `npm run build` | clean — 478 kB JS / 149 kB gzip · 48 kB CSS / 9 kB gzip |
| Clone test | fresh copy → `npm run setup` → `npm test` | setup clean, 206 passed |

Work completed after Sprint E: eight P0 defects, each with a regression test written from the
failure rather than the fix (`tests/regression-p0.test.ts`), and three P1 items — the
`tasks.board_id` index, `version` made mandatory on task writes, and the false-success empty
states. All three are documented with their before/after evidence in
`docs/06-AUDIT-AND-BACKLOG.md` §7. The remaining P1 and P2 items in that backlog are open and
listed there deliberately.
