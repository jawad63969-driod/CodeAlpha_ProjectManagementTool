# Software Requirements Specification — TaskForge

| | |
| --- | --- |
| **Product** | TaskForge — enterprise work management platform |
| **Document** | Software Requirements Specification (SRS) |
| **Version** | 1.0 |
| **Status** | Awaiting sign-off |
| **Author** | Ali Raza — Principal Engineer / Architect |
| **Standard** | Adapted from IEEE 830-1998 |
| **Context** | CodeAlpha Full Stack Development Internship — Task 3 |

---

## 1. Introduction

### 1.1 Purpose

This document specifies the complete requirements for **TaskForge**, a multi-tenant,
role-aware work management platform in the class of Jira and Asana. It is the contract
between the requirements and the implementation: every feature built in Phase 3 traces
back to a requirement ID here, and nothing outside this document gets built without an
amendment.

### 1.2 Scope

TaskForge lets an organisation plan, assign, discuss and track work on configurable
boards, with every change propagating to all connected users in real time.

**In scope for v1.0**

- Multi-tenant organisations with invitation-based membership
- Authentication with refresh-token rotation and session management
- Two-tier role-based access control (organisation roles × project roles)
- Projects containing multiple boards; boards composed of columns bound to workflow statuses
- Work items with types (Epic, Story, Task, Bug), priorities, estimates, due dates, assignees and labels
- Multi-level subtask hierarchies with cycle prevention
- File attachments with content-hash de-duplication
- Threaded comments with @mentions
- An immutable activity/audit log over every mutating operation
- In-app notifications with per-user read state
- Kanban and List views with accessible drag-and-drop
- Real-time synchronisation over WebSockets with presence

**Explicitly out of scope** — see §7.

### 1.3 Definitions

| Term | Meaning |
| --- | --- |
| **Organisation (Org)** | The tenant boundary. All data belongs to exactly one organisation. |
| **Project** | A container of work inside an organisation, with its own members and key (e.g. `TFG`). |
| **Board** | A visual arrangement of a project's work items. A project may have several. |
| **Column** | A vertical lane on a board, bound to exactly one workflow status. |
| **Workflow status** | A named state (`Backlog`, `In Progress`, `Code Review`, `Done`) belonging to a category (`TODO` / `IN_PROGRESS` / `DONE`). |
| **Task / Work item** | The unit of work. Identified to users by `PROJECTKEY-NUMBER`. |
| **Subtask** | A task whose `parent_task_id` points at another task. Nesting is permitted to a bounded depth. |
| **Actor** | The authenticated user performing an operation. |
| **RBAC** | Role-Based Access Control — permission derived from role, evaluated per resource. |

### 1.4 References

- CodeAlpha Full Stack Development Tasks & Instructions — Task 3
- `02-PROJECT-PLAN.md` — estimation, sprints, milestones
- `03-ARCHITECTURE.md` — system architecture and technology decisions
- `04-DATA-MODEL.md` — normalized database schema
- `adr/` — architecture decision records

---

## 2. Overall description

### 2.1 Product perspective

TaskForge is a greenfield system composed of three deployable/publishable units:
a REST + WebSocket API, a single-page web client, and a shared contracts package
consumed by both. It has no dependency on any existing system and replaces the v1
prototype entirely (archived at `CodeAlpha_ProjectManagementTool_v1/`).

### 2.2 User personas

**P1 — Ayesha Siddiqui, Engineering Director (Organisation Admin)**
Owns the workspace. Invites and deactivates people, creates projects, sets org-level roles,
reviews the audit trail. Success = "I can see who did what, and nobody has access they shouldn't."
*Needs: invitations, role management, audit log, project lifecycle control.*

**P2 — Sara Khan, Project Manager**
Runs delivery on two projects. Shapes the board and its workflow, breaks epics into stories,
assigns work, chases due dates, reports progress. Success = "I can see the state of the whole
project in five seconds."
*Needs: board configuration, bulk assignment, priorities and due dates, filters, progress signals, WIP limits.*

**P3 — Ali Raza, Developer**
Lives in the board daily. Picks up work, breaks it into subtasks, moves cards through
`In Progress → Code Review → Done`, discusses in the task thread, attaches screenshots.
Success = "Two clicks from opening the app to updating my work."
*Needs: My Work view, fast drag-and-drop, subtasks, comments, attachments, @mentions, keyboard shortcuts.*

**P4 — Hina Malik, Designer (Contributor)**
Works across projects part-time. Needs context quickly and comments more than she moves cards.
*Needs: notifications, mentions, threaded discussion, attachment previews, activity feed.*

**P5 — External Stakeholder (Viewer / Guest)**
A client or manager who must see progress but must never change anything.
*Needs: read-only board and task access, scoped strictly to invited projects.*

### 2.3 Operating environment

| | |
| --- | --- |
| Client | Evergreen desktop and mobile browsers (Chrome, Edge, Firefox, Safari — last 2 versions) |
| Server | Node.js 20 LTS or newer |
| Database | SQLite (development and the internship deliverable); PostgreSQL 16 in production via the same ORM schema |
| Transport | HTTPS + WSS in production; HTTP on `localhost` for development |

### 2.4 Constraints

| ID | Constraint |
| --- | --- |
| C-01 | The reviewer must be able to run the whole platform with two commands and no database server installation. |
| C-02 | TypeScript, strict mode, across API, web and shared contracts. No `any` in application code. |
| C-03 | No paid or account-gated third-party services (no cloud storage, no email provider) — everything runs locally. |
| C-04 | Every data-access path must be exercised by an automated test before handover. |
| C-05 | The schema must be portable to PostgreSQL without a redesign. |

### 2.5 Assumptions

- A single deployment serves multiple organisations; a user may belong to several.
- Attachments are modest in size (≤ 25 MB) and stored on the local filesystem behind the API.
- Email delivery is out of scope; invitations are surfaced in-app and by shareable token link.
- Time is stored in UTC and rendered in the viewer's local timezone.

---

## 3. Functional requirements

Priority: **M** = Must (v1.0), **S** = Should, **C** = Could.
Every requirement is written so it can be verified by an automated test.

### 3.1 Authentication and identity — FR-A

| ID | Pri | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR-A-01 | M | A visitor can register with name, email and password. | Email is unique case-insensitively; password ≥ 10 chars with at least one letter and one digit; rejected input returns field-level errors. |
| FR-A-02 | M | Passwords are stored only as bcrypt hashes (cost ≥ 12). | No endpoint ever returns a hash; the hash column never appears in a serialized response. |
| FR-A-03 | M | A user can sign in and receives a short-lived access token plus a long-lived refresh token. | Access token TTL ≤ 15 min; refresh TTL ≤ 30 days; refresh token is stored hashed, never in plaintext. |
| FR-A-04 | M | Refresh tokens rotate on use and detect reuse. | Using a rotated token invalidates the whole session family and returns 401. |
| FR-A-05 | M | Authentication failures are indistinguishable between "unknown email" and "wrong password". | Both return identical status, body and timing class. |
| FR-A-06 | M | A user can sign out, invalidating the current session. | The refresh token is revoked; subsequent refresh returns 401. |
| FR-A-07 | S | A user can list and revoke their active sessions. | Each session shows device/user-agent and last-used time. |
| FR-A-08 | M | Credential endpoints are rate limited. | ≥ 10 failed attempts in 15 min from one IP returns 429. |
| FR-A-09 | S | A user can update their display name, job title, timezone and avatar colour. | Changes appear to other users in real time. |

### 3.2 Organisations and membership — FR-B

| ID | Pri | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR-B-01 | M | Registering creates a personal organisation with the registrant as `OWNER`. | The new user lands in a usable workspace with zero manual setup. |
| FR-B-02 | M | An `OWNER`/`ADMIN` can invite a person by email with an org role. | An invitation record with a single-use token and expiry (7 days) is created. |
| FR-B-03 | M | An invited person accepts by token and becomes a member. | Accepting twice fails; expired or revoked tokens fail with a distinct error. |
| FR-B-04 | M | An `OWNER`/`ADMIN` can change a member's org role or deactivate them. | A deactivated member's tokens stop working within one access-token TTL. |
| FR-B-05 | M | An organisation always has at least one active `OWNER`. | Removing or demoting the last owner is rejected. |
| FR-B-06 | M | All queries are scoped to the caller's organisation. | A request carrying another org's resource ID returns 404, never 403 (no existence leak). |

### 3.3 Role-based access control — FR-C

| ID | Pri | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR-C-01 | M | Org roles are `OWNER`, `ADMIN`, `MEMBER`, `GUEST`. | Stored as a constrained enum. |
| FR-C-02 | M | Project roles are `PROJECT_MANAGER`, `DEVELOPER`, `VIEWER`. | Assigned per project membership, independent of org role. |
| FR-C-03 | M | Effective permission = the union of org-derived and project-derived grants. | Org `ADMIN` reaches every project in the org; a `MEMBER` reaches only projects they are a member of. |
| FR-C-04 | M | Every mutating endpoint declares a required permission and is checked centrally. | A route with no declared permission fails a build-time check. |
| FR-C-05 | M | `VIEWER` can read everything in the project and mutate nothing. | All write endpoints return 403 for a viewer. |
| FR-C-06 | M | `DEVELOPER` can create and edit work items, comment and attach; cannot configure the board or manage members. | Verified per endpoint in the test matrix. |
| FR-C-07 | M | `PROJECT_MANAGER` can additionally configure boards, statuses, labels and project membership. | — |
| FR-C-08 | M | Authorization is enforced identically on WebSocket subscriptions. | Subscribing to a project room without membership is rejected. |
| FR-C-09 | S | The permission matrix is exported as machine-readable data and rendered in the docs. | One source of truth, no drift between code and documentation. |

### 3.4 Projects — FR-D

| ID | Pri | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR-D-01 | M | Create a project with name, unique key (2–10 uppercase letters), description, colour and lead. | Key is unique per organisation and immutable after creation. |
| FR-D-02 | M | Creating a project provisions a default board, four workflow statuses and four columns. | `Backlog`, `In Progress`, `Code Review`, `Done` exist immediately. |
| FR-D-03 | M | Add/remove project members with a project role. | Removing a member unassigns their open work items and records an activity entry. |
| FR-D-04 | M | Archive a project (soft delete) and restore it. | Archived projects are hidden from default listings and are read-only. |
| FR-D-05 | M | Hard-delete a project (`OWNER` only) cascades to all of its data. | Verified by a referential-integrity test. |
| FR-D-06 | S | Project overview reports counts by status, by assignee and overdue items. | Computed server-side in a single query. |

### 3.5 Boards, columns and workflow — FR-E

| ID | Pri | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR-E-01 | M | A project may hold multiple boards; one is the default. | — |
| FR-E-02 | M | A board renders as **Kanban** or **List**; the choice persists per user per board. | — |
| FR-E-03 | M | Columns can be created, renamed, reordered and deleted. | Deleting a column requires the target column for its work items. |
| FR-E-04 | M | Each column binds to exactly one workflow status; statuses carry a category. | Moving a card to a `DONE`-category column sets `resolved_at`. |
| FR-E-05 | S | A column may declare a WIP limit; exceeding it is surfaced visually but not blocked. | Soft limit, as in Jira. |
| FR-E-06 | M | Work item order within a column is explicit and stable under concurrent edits. | Two users reordering simultaneously converge without duplicate or lost positions. |

### 3.6 Work items and subtasks — FR-F

| ID | Pri | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR-F-01 | M | Create a work item with title, description, type, priority, assignee, due date, estimate and labels. | Title 2–200 chars; description ≤ 20 000 chars. |
| FR-F-02 | M | Each item gets a per-project sequential number rendered as `KEY-N`. | Numbers never collide or reuse, even under concurrent creation. |
| FR-F-03 | M | Types are `EPIC`, `STORY`, `TASK`, `BUG`, `SUBTASK`. | — |
| FR-F-04 | M | Priorities are `LOWEST`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`. | Default `MEDIUM`. |
| FR-F-05 | M | An item may have a parent, forming a hierarchy up to **5 levels** deep. | Depth beyond 5 is rejected. |
| FR-F-06 | M | The hierarchy can never contain a cycle. | Setting a parent to a descendant is rejected with a specific error. |
| FR-F-07 | M | Deleting a parent requires an explicit strategy: cascade or re-parent to grandparent. | Default is re-parent; cascade must be requested. |
| FR-F-08 | M | A parent shows aggregate subtask progress (done / total). | Computed in one query, not N+1. |
| FR-F-09 | M | Move an item between columns and positions in one operation. | Emits a real-time event and one activity entry. |
| FR-F-10 | S | Assign labels from a project-scoped label set with colours. | Many-to-many; labels are reusable across items. |
| FR-F-11 | S | Watch/unwatch an item to receive notifications without being the assignee. | Assignee and reporter are watchers implicitly. |
| FR-F-12 | M | A cross-project "My Work" view lists open items assigned to the caller. | Sorted by priority then due date; paginated. |
| FR-F-13 | S | Filter a board by text, assignee, type, priority, label and due window. | Filters are server-evaluated and shareable via URL. |
| FR-F-14 | M | Concurrent edits to the same item are detected. | A stale-version write returns 409 with the current server state. |

### 3.7 Attachments — FR-G

| ID | Pri | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR-G-01 | M | Attach files to a work item (≤ 25 MB each, configurable). | Oversized uploads are rejected before the body is buffered to disk. |
| FR-G-02 | M | Stored content is addressed by SHA-256 hash; identical files are stored once. | Two uploads of the same bytes create two attachment rows and one blob. |
| FR-G-03 | M | Downloads require the same project read permission as the item. | Guessing a blob path without authorization fails. |
| FR-G-04 | M | Only the uploader or a `PROJECT_MANAGER` can delete an attachment. | Blob is garbage-collected when its last reference is removed. |
| FR-G-05 | S | Image attachments render as inline thumbnails. | MIME type is validated from the bytes, not the declared header. |

### 3.8 Discussion and collaboration — FR-H

| ID | Pri | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR-H-01 | M | Comment on a work item. | 1–5 000 chars; trimmed; empty rejected. |
| FR-H-02 | M | Reply to a comment, forming a thread one level deep. | Replies are ordered chronologically under their root. |
| FR-H-03 | M | Edit or delete your own comment; a `PROJECT_MANAGER` may delete any. | Edits are marked and record `edited_at`. |
| FR-H-04 | M | @mention a project member; they receive a notification. | Mentions are resolved server-side to user IDs and stored relationally. |
| FR-H-05 | S | Live "X is typing…" indicators within a task thread. | Expires 3 s after the last keystroke. |

### 3.9 Activity, audit and notifications — FR-I

| ID | Pri | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR-I-01 | M | Every mutating operation writes an activity record: actor, verb, entity, before/after. | Written in the same transaction as the mutation — no mutation without an audit row. |
| FR-I-02 | M | Activity records are immutable and never deleted while their project exists. | No update or delete path exists in the repository layer. |
| FR-I-03 | M | A project activity feed is readable by any project member, newest first, paginated. | — |
| FR-I-04 | M | A per-item activity timeline interleaves field changes and comments. | — |
| FR-I-05 | M | Notifications are generated for assignment, mention, comment on a watched item, and status change. | Never notify the actor about their own action. |
| FR-I-06 | M | Notifications have per-user read state and a bulk "mark all read". | Unread count is a single indexed query. |

### 3.10 Real-time synchronisation — FR-J

| ID | Pri | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR-J-01 | M | The WebSocket handshake authenticates with the same access token as the REST API. | An invalid or expired token is refused at connect time. |
| FR-J-02 | M | Clients subscribe to project rooms; server-side membership is re-verified on subscribe. | — |
| FR-J-03 | M | Item create/update/move/delete, column changes, comments and membership changes broadcast within 200 ms locally. | Asserted by an automated two-client test. |
| FR-J-04 | M | Every event carries `{ type, version, actorId, occurredAt, payload }`. | Clients ignore events originating from their own optimistic mutation. |
| FR-J-05 | M | Board presence shows who else is viewing. | Updates on join, leave and disconnect. |
| FR-J-06 | M | On reconnect the client re-fetches board state rather than replaying missed events. | Guarantees convergence without an event log. |
| FR-J-07 | S | Live drag preview shows another user moving a card. | Expires after 2.5 s of silence. |

---

## 4. Data and task structure requirements

### 4.1 Work item structure

```
Organisation
└── Project (key: TFG)
    ├── Board (default: "TaskForge Delivery")
    │   └── Column ──▶ WorkflowStatus (category: TODO | IN_PROGRESS | DONE)
    │       └── ordered WorkItems
    └── WorkItem  TFG-42
        ├── identity      id, project_id, number ("TFG-42"), type, version
        ├── content       title, description
        ├── planning      priority, story_points, estimate_minutes, due_date, start_date
        ├── people        reporter_id, assignee_id, watchers[]
        ├── placement     board_id, column_id, status_id, position (lexo-rank)
        ├── hierarchy     parent_task_id, depth (≤ 5), path
        ├── tagging       labels[] (many-to-many)
        ├── artefacts     attachments[], comments[]
        ├── lifecycle     created_at, updated_at, resolved_at, archived_at
        └── audit         activity[]
```

### 4.2 Ordering model

Positions use **sparse fractional ranks** (`1024.0`, `2048.0`, …). Inserting between two
neighbours stores their midpoint, so a move is a single-row update rather than a renumber
of the column. A background compaction runs when the gap between neighbours falls below a
threshold. This is the mechanism behind FR-E-06.

### 4.3 Hierarchy model

Each item stores `parent_task_id` **and** a materialised `path` (`/root_id/child_id/`).
The path makes "all descendants" a single indexed prefix query instead of a recursive walk,
makes cycle detection an O(1) string check (FR-F-06), and makes depth a character count
(FR-F-05).

### 4.4 Retention

| Data | Policy |
| --- | --- |
| Activity log | Retained for the life of the project; never mutated |
| Notifications | Retained 90 days, then pruned by a scheduled job |
| Refresh tokens | Deleted on rotation; expired rows pruned daily |
| Attachments | Blob removed when the last referencing row is deleted |
| Archived projects | Retained indefinitely until hard-deleted by an owner |

---

## 5. External interface requirements

### 5.1 API

- REST over HTTPS, versioned at `/api/v1`, JSON request and response bodies.
- Cursor pagination on every collection: `?limit=&cursor=` → `{ data, nextCursor }`.
- Uniform error envelope: `{ error: { code, message, details?, requestId } }`.
- `X-Request-Id` echoed on every response for log correlation.
- Optimistic concurrency via an integer `version` on mutable resources.
- OpenAPI 3.1 document generated from the Zod schemas — never hand-written.

### 5.2 WebSocket

Socket.IO over the same origin and port. Rooms: `org:{id}`, `project:{id}`, `user:{id}`.
Event names are namespaced (`task.created`, `task.moved`, `comment.created`) and typed in
the shared contracts package, so the server cannot emit an event the client does not know.

### 5.3 User interface

- Responsive from 360 px to 2560 px.
- Keyboard-operable: every drag-and-drop action has a keyboard equivalent (FR-E-06, WCAG 2.1 AA).
- Light and dark themes, honouring `prefers-color-scheme` with a manual override.
- Optimistic updates on every mutation, with rollback and a toast on failure.

---

## 6. Non-functional requirements

| ID | Category | Requirement | Verification |
| --- | --- | --- | --- |
| NFR-01 | Performance | Board of 500 items renders interactive in < 1.5 s on a mid-range laptop. | Measured in the E2E suite with a seeded 500-item project. |
| NFR-02 | Performance | p95 API latency < 150 ms for reads, < 250 ms for writes, locally. | Measured in the integration suite. |
| NFR-03 | Performance | No N+1 queries on any list endpoint. | Query-count assertions in integration tests. |
| NFR-04 | Scalability | Mesh-free: real-time layer must work behind multiple API instances. | Socket.IO adapter interface abstracted; Redis adapter documented. |
| NFR-05 | Security | All input validated by Zod at the boundary; no unvalidated body reaches a service. | Build-time check that every route declares a schema. |
| NFR-06 | Security | All SQL parameterised through the ORM; no string-built queries. | Lint rule + review. |
| NFR-07 | Security | Security headers (Helmet), strict CORS allowlist, and payload size caps. | Integration test asserts headers. |
| NFR-08 | Security | Tenant isolation proven by test: user A cannot read, write or even confirm the existence of org B's data. | Dedicated isolation test suite. |
| NFR-09 | Reliability | Every mutation and its audit row commit in one transaction. | Failure-injection test leaves no orphan rows. |
| NFR-10 | Reliability | Graceful shutdown drains HTTP and WebSocket connections. | — |
| NFR-11 | Maintainability | Strict TypeScript, no `any`, ESLint clean, layered architecture with no upward imports. | CI gate + dependency-cruiser rule. |
| NFR-12 | Maintainability | Business logic lives in services and is unit-testable without HTTP. | ≥ 80 % line coverage on the service layer. |
| NFR-13 | Observability | Structured JSON logging with request ID, actor ID and duration on every request. | — |
| NFR-14 | Observability | `/healthz` (liveness) and `/readyz` (DB reachable) endpoints. | — |
| NFR-15 | Portability | Runs with `npm install && npm run dev` on Windows, macOS and Linux — no database server. | Verified from a clean clone. |
| NFR-16 | Accessibility | WCAG 2.1 AA: focus management, ARIA roles on the board, keyboard drag alternative, 4.5:1 contrast. | axe-core automated pass. |
| NFR-17 | Usability | Any destructive action is confirmed and reversible where technically possible. | — |
| NFR-18 | Testability | Deterministic seed data; tests run against an isolated database per run. | — |

---

## 7. Out of scope for v1.0

Recorded so scope creep is a decision, not an accident:

- Email delivery, digests and SMTP configuration
- SSO / OAuth / SAML providers
- Sprints, velocity charts, burndown and roadmap timelines *(schema leaves room; UI deferred)*
- Time tracking and worklogs
- Custom fields and custom workflows per project
- Automation rules ("when status → Done, assign to QA")
- Mobile native applications
- Full-text search across organisations (v1 uses per-project filtering)
- Billing, plans and quotas

---

## 8. Traceability — brief to requirements

| CodeAlpha Task 3 brief item | Requirements |
| --- | --- |
| Create group projects | FR-B-01…06, FR-D-01…05 |
| Assign tasks | FR-F-01, FR-F-04, FR-F-12, FR-I-05 |
| Comment and communicate within tasks | FR-H-01…05 |
| Full stack with auth system | FR-A-01…09, FR-C-01…09 |
| Project boards and task cards | FR-E-01…06, FR-F-01…14 |
| Backend manages users, projects, tasks, comments | §4, `04-DATA-MODEL.md` |
| **Bonus:** notifications and real-time updates via WebSockets | FR-I-05…06, FR-J-01…07 |

**Enterprise capabilities beyond the brief:** multi-tenancy (FR-B), two-tier RBAC (FR-C),
multi-level subtasks (FR-F-05…08), attachments with de-duplication (FR-G), immutable audit
trail (FR-I-01…04), optimistic concurrency (FR-F-14), refresh-token rotation with reuse
detection (FR-A-03…04).

---

## 9. Sign-off

| Role | Name | Decision |
| --- | --- | --- |
| Product owner | Ali Raza | ☐ Approved ☐ Approved with changes ☐ Rejected |
| Architect | — | Submitted for review |

No implementation begins until this document and `02-PROJECT-PLAN.md` are approved.
