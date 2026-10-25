# Data Model — TaskForge

| | |
| --- | --- |
| **Version** | 1.0 |
| **Status** | Awaiting sign-off |
| **Normal form** | 3NF, with two documented, justified denormalizations (§6) |
| **Tables** | 20 implemented (21 designed — `invitations` descoped in the re-baseline, PROJECT-PLAN §9.2) |
| **Targets** | SQLite (dev) and PostgreSQL 16 (prod) from one Drizzle schema |

---

## 1. Entity-relationship overview

```
                              ┌──────────────────┐
                              │  organizations   │ ◀── tenant root
                              └────────┬─────────┘
                    ┌──────────────────┼──────────────────┬────────────────┐
                    ▼                  ▼                  ▼                ▼
         ┌────────────────────┐ ┌────────────┐   ┌──────────────┐  ┌─────────────┐
         │organization_members│ │ invitations│   │   projects   │  │   labels    │
         └─────────┬──────────┘ └────────────┘   └──────┬───────┘  └──────┬──────┘
                   │                                    │                 │
         ┌─────────▼──────┐                 ┌───────────┼───────────┐     │
         │     users      │                 ▼           ▼           ▼     │
         └───┬────────┬───┘        ┌───────────────┐ ┌──────┐ ┌──────────────────┐
             │        │            │project_members│ │boards│ │workflow_statuses │
             │        │            └───────────────┘ └───┬──┘ └────────┬─────────┘
             │        │                                  │             │
             │        │                          ┌───────▼─────────────▼───┐
             │        │                          │      board_columns      │
             │        │                          └────────────┬────────────┘
             │        │                                       │
             │        │                          ┌────────────▼────────────┐
             │        └─────────────────────────▶│         tasks           │◀─┐ self-ref
             │                                   │  parent_task_id, path   │──┘ hierarchy
             │                                   └──┬──────┬──────┬────┬───┘
             │                     ┌────────────────┘      │      │    └──────────┐
             │                     ▼                       ▼      ▼               ▼
             │            ┌────────────────┐      ┌────────────┐ ┌──────────┐ ┌───────────┐
             │            │  task_labels   │      │task_watchers│ │ comments │ │attachments│
             │            └────────────────┘      └────────────┘ └────┬─────┘ └─────┬─────┘
             │                                                        │             │
             │                                            ┌───────────▼──────┐ ┌────▼────┐
             │                                            │ comment_mentions │ │  blobs  │
             │                                            └──────────────────┘ └─────────┘
             │
             ├──────────▶ ┌──────────┐   ┌───────────────┐   ┌──────────────────────────┐
             │            │ sessions │   │ notifications │   │ user_board_preferences   │
             │            └──────────┘   └───────────────┘   └──────────────────────────┘
             │
             └──────────▶ ┌────────────┐
                          │ activities │ ◀── immutable audit trail (polymorphic entity ref)
                          └────────────┘
```

---

## 2. Conventions

| Convention | Rule |
| --- | --- |
| Primary keys | `TEXT` ULID-style, prefixed by entity (`usr_…`, `tsk_…`). Sortable by creation time, safe in URLs, no sequence contention, portable across both engines. |
| Timestamps | `created_at`, `updated_at` as ISO-8601 UTC text (SQLite) / `timestamptz` (Postgres). Never a local time. |
| Soft delete | `archived_at TIMESTAMP NULL` only where restore is a requirement (projects, tasks). Everything else is a hard delete with `ON DELETE CASCADE`. |
| Enumerations | `TEXT` with a `CHECK` constraint in SQLite; native `ENUM` in Postgres. The Drizzle schema declares them once. |
| Booleans | `INTEGER 0/1` in SQLite, `boolean` in Postgres — abstracted by Drizzle. |
| Tenant column | Every table reachable without a join carries `organization_id` so isolation never depends on a join being remembered. |
| Foreign keys | Always declared, always with an explicit `ON DELETE` action. `PRAGMA foreign_keys = ON`. |
| Naming | `snake_case` tables and columns, plural table names, `{table}_{column}` index names. |

---

## 3. Table specifications

### 3.1 Identity and tenancy

**`organizations`** — the tenant boundary.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | TEXT | PK, `org_…` |
| `name` | TEXT | NOT NULL, 2–80 |
| `slug` | TEXT | NOT NULL, UNIQUE, lowercase `[a-z0-9-]` |
| `plan` | TEXT | NOT NULL DEFAULT `'free'`, CHECK in (`free`,`team`,`enterprise`) |
| `created_at` / `updated_at` | TIMESTAMP | NOT NULL |

**`users`** — a global identity that may belong to several organisations.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | TEXT | PK, `usr_…` |
| `email` | TEXT | NOT NULL, UNIQUE (stored lowercased) |
| `password_hash` | TEXT | NOT NULL — never serialized |
| `name` | TEXT | NOT NULL, 2–80 |
| `job_title` | TEXT | NULL |
| `avatar_color` | TEXT | NOT NULL, `#rrggbb` |
| `timezone` | TEXT | NOT NULL DEFAULT `'UTC'` |
| `is_active` | BOOLEAN | NOT NULL DEFAULT true |
| `last_login_at` | TIMESTAMP | NULL |
| `created_at` / `updated_at` | TIMESTAMP | NOT NULL |

*Indexes:* `users_email_uq` UNIQUE(`email`).

**`organization_members`** — resolves the many-to-many between users and organisations, and carries the org role.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | TEXT | PK |
| `organization_id` | TEXT | FK → organizations, CASCADE |
| `user_id` | TEXT | FK → users, CASCADE |
| `role` | TEXT | NOT NULL, CHECK in (`OWNER`,`ADMIN`,`MEMBER`,`GUEST`) |
| `status` | TEXT | NOT NULL DEFAULT `'ACTIVE'`, CHECK in (`ACTIVE`,`SUSPENDED`) |
| `joined_at` | TIMESTAMP | NOT NULL |

*Indexes:* UNIQUE(`organization_id`,`user_id`); INDEX(`user_id`); partial INDEX on `role='OWNER'` to make the last-owner check (FR-B-05) cheap.

**`invitations`** *(designed, not implemented — descoped to direct add-by-email in PROJECT-PLAN §9.2)*

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | TEXT | PK |
| `organization_id` | TEXT | FK → organizations, CASCADE |
| `email` | TEXT | NOT NULL, lowercased |
| `role` | TEXT | NOT NULL, CHECK in (`ADMIN`,`MEMBER`,`GUEST`) |
| `token_hash` | TEXT | NOT NULL, UNIQUE — SHA-256 of the token; the plaintext exists only in the invite link |
| `invited_by` | TEXT | FK → users, SET NULL |
| `expires_at` | TIMESTAMP | NOT NULL |
| `accepted_at` | TIMESTAMP | NULL |
| `revoked_at` | TIMESTAMP | NULL |

*Indexes:* UNIQUE(`token_hash`); UNIQUE(`organization_id`,`email`) WHERE `accepted_at IS NULL AND revoked_at IS NULL` — one live invitation per address.

**`sessions`** — one row per refresh token, forming a rotation family.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | TEXT | PK |
| `user_id` | TEXT | FK → users, CASCADE |
| `family_id` | TEXT | NOT NULL — shared by every token in one rotation chain |
| `token_hash` | TEXT | NOT NULL, UNIQUE |
| `user_agent` / `ip_address` | TEXT | NULL |
| `expires_at` | TIMESTAMP | NOT NULL |
| `rotated_at` | TIMESTAMP | NULL — set when this token is exchanged |
| `revoked_at` | TIMESTAMP | NULL |

*Indexes:* UNIQUE(`token_hash`); INDEX(`user_id`,`expires_at`); INDEX(`family_id`).
**Reuse detection (FR-A-04):** presenting a token whose `rotated_at IS NOT NULL` revokes every row sharing its `family_id`.

### 3.2 Projects and board configuration

**`projects`**

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | TEXT | PK, `prj_…` |
| `organization_id` | TEXT | FK → organizations, CASCADE |
| `key` | TEXT | NOT NULL, 2–10 uppercase letters, immutable |
| `name` | TEXT | NOT NULL, 2–120 |
| `description` | TEXT | NOT NULL DEFAULT `''` |
| `color` | TEXT | NOT NULL, `#rrggbb` |
| `lead_id` | TEXT | FK → users, SET NULL |
| `task_sequence` | INTEGER | NOT NULL DEFAULT 0 — see §6.1 |
| `archived_at` | TIMESTAMP | NULL |
| `created_by` | TEXT | FK → users, SET NULL |
| `created_at` / `updated_at` | TIMESTAMP | NOT NULL |

*Indexes:* UNIQUE(`organization_id`,`key`); INDEX(`organization_id`,`archived_at`).

**`project_members`**

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | TEXT | PK |
| `project_id` | TEXT | FK → projects, CASCADE |
| `user_id` | TEXT | FK → users, CASCADE |
| `role` | TEXT | NOT NULL, CHECK in (`PROJECT_MANAGER`,`DEVELOPER`,`VIEWER`) |
| `added_by` | TEXT | FK → users, SET NULL |
| `joined_at` | TIMESTAMP | NOT NULL |

*Indexes:* UNIQUE(`project_id`,`user_id`); INDEX(`user_id`) — the hot path for "my projects".

**`boards`**

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | TEXT | PK |
| `project_id` | TEXT | FK → projects, CASCADE |
| `name` | TEXT | NOT NULL |
| `is_default` | BOOLEAN | NOT NULL DEFAULT false |
| `created_at` / `updated_at` | TIMESTAMP | NOT NULL |

*Indexes:* INDEX(`project_id`); UNIQUE(`project_id`) WHERE `is_default` — exactly one default board.

**`workflow_statuses`** — the project's state machine; columns reference these, not free text.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | TEXT | PK |
| `project_id` | TEXT | FK → projects, CASCADE |
| `name` | TEXT | NOT NULL — `Backlog`, `In Progress`, `Code Review`, `Done` |
| `category` | TEXT | NOT NULL, CHECK in (`TODO`,`IN_PROGRESS`,`DONE`) |
| `position` | REAL | NOT NULL |
| `is_initial` | BOOLEAN | NOT NULL DEFAULT false |

*Indexes:* UNIQUE(`project_id`,`name`); INDEX(`project_id`,`position`).
Separating **status** from **column** is what allows two boards over the same project to
arrange the same states differently, and it is what makes `resolved_at` (FR-E-04) derivable
from `category` rather than from a column's name.

**`board_columns`**

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | TEXT | PK |
| `board_id` | TEXT | FK → boards, CASCADE |
| `status_id` | TEXT | FK → workflow_statuses, RESTRICT |
| `name` | TEXT | NOT NULL |
| `position` | REAL | NOT NULL |
| `wip_limit` | INTEGER | NULL, CHECK > 0 |

*Indexes:* UNIQUE(`board_id`,`status_id`) — a status appears at most once per board; INDEX(`board_id`,`position`).

**`labels`**

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | TEXT | PK |
| `project_id` | TEXT | FK → projects, CASCADE |
| `name` | TEXT | NOT NULL, 1–32 |
| `color` | TEXT | NOT NULL, `#rrggbb` |

*Indexes:* UNIQUE(`project_id`,`name`).

**`user_board_preferences`** — per-user view state (FR-E-02).

| Column | Type | Constraints |
| --- | --- | --- |
| `user_id` | TEXT | FK → users, CASCADE |
| `board_id` | TEXT | FK → boards, CASCADE |
| `view_mode` | TEXT | NOT NULL DEFAULT `'KANBAN'`, CHECK in (`KANBAN`,`LIST`) |
| `filters_json` | TEXT | NOT NULL DEFAULT `'{}'` |

*PK:* (`user_id`,`board_id`).

### 3.3 Work items

**`tasks`** — the centre of the model.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | TEXT | PK, `tsk_…` |
| `organization_id` | TEXT | FK → organizations, CASCADE — denormalized tenant column |
| `project_id` | TEXT | FK → projects, CASCADE |
| `board_id` | TEXT | FK → boards, CASCADE |
| `column_id` | TEXT | FK → board_columns, RESTRICT |
| `status_id` | TEXT | FK → workflow_statuses, RESTRICT |
| `number` | INTEGER | NOT NULL — per project; rendered `KEY-number` |
| `type` | TEXT | NOT NULL, CHECK in (`EPIC`,`STORY`,`TASK`,`BUG`,`SUBTASK`) |
| `title` | TEXT | NOT NULL, 2–200 |
| `description` | TEXT | NOT NULL DEFAULT `''`, ≤ 20 000 |
| `priority` | TEXT | NOT NULL DEFAULT `'MEDIUM'`, CHECK in (`LOWEST`,`LOW`,`MEDIUM`,`HIGH`,`CRITICAL`) |
| `assignee_id` | TEXT | FK → users, SET NULL |
| `reporter_id` | TEXT | FK → users, SET NULL |
| `parent_task_id` | TEXT | FK → tasks, SET NULL |
| `path` | TEXT | NOT NULL — materialised ancestry, see §6.2 |
| `depth` | INTEGER | NOT NULL DEFAULT 0, CHECK ≤ 4 |
| `position` | REAL | NOT NULL — sparse fractional rank within the column |
| `story_points` | INTEGER | NULL, CHECK ≥ 0 |
| `estimate_minutes` | INTEGER | NULL, CHECK ≥ 0 |
| `start_date` / `due_date` | DATE | NULL, CHECK `due_date >= start_date` |
| `resolved_at` | TIMESTAMP | NULL — set when moved into a `DONE`-category status |
| `archived_at` | TIMESTAMP | NULL |
| `version` | INTEGER | NOT NULL DEFAULT 1 — optimistic concurrency (FR-F-14) |
| `created_at` / `updated_at` | TIMESTAMP | NOT NULL |

*Indexes:*

| Index | Serves |
| --- | --- |
| UNIQUE(`project_id`,`number`) | Stable `KEY-N` references |
| INDEX(`column_id`,`position`) | Board column rendering — the single hottest query |
| INDEX(`project_id`,`archived_at`) | Project listings |
| INDEX(`assignee_id`,`resolved_at`) | "My Work" |
| INDEX(`parent_task_id`) | Direct children |
| INDEX(`path`) | Whole-subtree prefix queries |
| INDEX(`project_id`,`due_date`) WHERE `resolved_at IS NULL` | Overdue reporting |

**`task_labels`** — pure junction table.

`task_id` FK CASCADE · `label_id` FK CASCADE · PK(`task_id`,`label_id`) · INDEX(`label_id`).

**`task_watchers`** — pure junction table.

`task_id` FK CASCADE · `user_id` FK CASCADE · `created_at` · PK(`task_id`,`user_id`) · INDEX(`user_id`).

### 3.4 Attachments

**`blobs`** — content-addressed storage, so identical files are stored once (FR-G-02).

| Column | Type | Constraints |
| --- | --- | --- |
| `hash` | TEXT | PK — SHA-256 hex of the content |
| `size_bytes` | INTEGER | NOT NULL |
| `mime_type` | TEXT | NOT NULL — sniffed from bytes, not from the client header |
| `storage_path` | TEXT | NOT NULL |
| `ref_count` | INTEGER | NOT NULL DEFAULT 0 — maintained inside the attachment transaction |
| `created_at` | TIMESTAMP | NOT NULL |

**`attachments`** — a named reference from a task to a blob.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | TEXT | PK |
| `organization_id` | TEXT | FK → organizations, CASCADE |
| `task_id` | TEXT | FK → tasks, CASCADE |
| `blob_hash` | TEXT | FK → blobs, RESTRICT |
| `file_name` | TEXT | NOT NULL — the uploader's name for it |
| `uploaded_by` | TEXT | FK → users, SET NULL |
| `created_at` | TIMESTAMP | NOT NULL |

*Indexes:* INDEX(`task_id`); INDEX(`blob_hash`).
Deleting the last attachment for a blob decrements `ref_count` to zero and schedules the
file for removal — inside the same transaction, which is what prevents R8 in the risk register.

### 3.5 Discussion

**`comments`** — threads one level deep (FR-H-02).

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | TEXT | PK |
| `organization_id` | TEXT | FK → organizations, CASCADE |
| `task_id` | TEXT | FK → tasks, CASCADE |
| `author_id` | TEXT | FK → users, SET NULL |
| `parent_comment_id` | TEXT | FK → comments, CASCADE — NULL for a root comment |
| `body` | TEXT | NOT NULL, 1–5 000 |
| `edited_at` | TIMESTAMP | NULL |
| `created_at` | TIMESTAMP | NOT NULL |

*Indexes:* INDEX(`task_id`,`created_at`); INDEX(`parent_comment_id`).
A `CHECK` enforces that a comment with a parent may not itself be a parent — depth is capped at one by the schema, not by application code alone.

**`comment_mentions`** — mentions stored relationally rather than re-parsed from text (FR-H-04).

`comment_id` FK CASCADE · `user_id` FK CASCADE · PK(`comment_id`,`user_id`) · INDEX(`user_id`).

### 3.6 Audit and notifications

**`activities`** — append-only audit trail (FR-I-01…04).

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | TEXT | PK |
| `organization_id` | TEXT | FK → organizations, CASCADE |
| `project_id` | TEXT | FK → projects, CASCADE, NULL for org-level events |
| `actor_id` | TEXT | FK → users, SET NULL |
| `entity_type` | TEXT | NOT NULL, CHECK in (`PROJECT`,`BOARD`,`COLUMN`,`TASK`,`COMMENT`,`ATTACHMENT`,`MEMBER`) |
| `entity_id` | TEXT | NOT NULL |
| `action` | TEXT | NOT NULL — `created`, `updated`, `moved`, `deleted`, `assigned`, … |
| `changes_json` | TEXT | NOT NULL DEFAULT `'{}'` — `{ field: { from, to } }` |
| `created_at` | TIMESTAMP | NOT NULL |

*Indexes:* INDEX(`project_id`,`created_at` DESC); INDEX(`entity_type`,`entity_id`,`created_at` DESC); INDEX(`actor_id`,`created_at` DESC).

**Polymorphic reference, deliberately.** `entity_type` + `entity_id` cannot carry a foreign
key, which is normally a smell. It is correct here because an audit record must **outlive
the row it describes** — a cascade from a deleted task would erase the evidence that the
task was deleted. Integrity is enforced at the service layer, where every audit write
happens in the same transaction as its mutation.

**`notifications`**

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | TEXT | PK |
| `organization_id` | TEXT | FK → organizations, CASCADE |
| `user_id` | TEXT | FK → users, CASCADE — the recipient |
| `actor_id` | TEXT | FK → users, SET NULL |
| `type` | TEXT | NOT NULL, CHECK in (`TASK_ASSIGNED`,`TASK_MOVED`,`COMMENT_CREATED`,`MENTIONED`,`PROJECT_INVITED`,`DUE_SOON`) |
| `project_id` / `task_id` / `comment_id` | TEXT | FK, CASCADE, nullable |
| `message` | TEXT | NOT NULL |
| `read_at` | TIMESTAMP | NULL |
| `created_at` | TIMESTAMP | NOT NULL |

*Indexes:* INDEX(`user_id`,`read_at`,`created_at` DESC) — serves both the feed and the unread badge from one index.
A `CHECK` forbids `actor_id = user_id` — the database itself refuses to notify you about your own action (FR-I-05).

---

## 4. Normalization analysis

**1NF** — every column holds one atomic value. Multi-valued relationships (labels, watchers,
mentions) are junction tables, not comma-separated strings. The only JSON columns are
`activities.changes_json` and `user_board_preferences.filters_json`, which store genuinely
schemaless documents that are never queried by their internal fields.

**2NF** — no partial dependency on part of a composite key. Every junction table
(`task_labels`, `task_watchers`, `comment_mentions`) holds only its two keys plus a
timestamp; no attribute depends on one half of the key.

**3NF** — no transitive dependency. Three cases were considered and resolved:

| Candidate violation | Resolution |
| --- | --- |
| `tasks.status_id` is reachable through `column_id → board_columns.status_id` | Kept as a direct column **by design**: status is a property of the work item, while the column is a property of its placement on one board. A task shown on a second board keeps its status and takes a different column. Not transitive — they are independent facts that happen to agree on the default board. |
| Label colour on the task | Rejected. Colour belongs to `labels` and is joined; storing it per task would allow two truths for one label. |
| Assignee name/avatar on the task | Rejected. Joined from `users`. Renaming a user must not require touching thousands of task rows. |

**Referential integrity.** Every foreign key declares an explicit action:
`CASCADE` where the child is meaningless without the parent (a comment without its task);
`SET NULL` where the record survives its reference (a task whose reporter left);
`RESTRICT` where deletion must be blocked until the caller resolves it (a status still in use by a column).

---

## 5. Key access paths

| Query | Plan |
| --- | --- |
| Render a board | One query per board joining tasks → columns, ordered by `(column_id, position)`; labels and assignees batched in two follow-up `IN` queries. Three queries total, independent of item count — never N+1 (NFR-03). |
| Subtask progress | One aggregate over `path LIKE '/root_id/%'` grouped by status category — not a recursive walk. |
| My Work | Index-only scan on `(assignee_id, resolved_at)` then a batched project lookup. |
| Unread badge | `COUNT(*)` on `(user_id, read_at)` — covered by the composite index. |
| Project activity feed | Descending scan on `(project_id, created_at)` with cursor pagination. |
| Permission check | `project_members` UNIQUE(`project_id`,`user_id`) point lookup, cached for the request's lifetime. |

---

## 6. Deliberate denormalizations

Two, each with the reasoning recorded so a future reader does not "fix" them.

### 6.1 `projects.task_sequence`

A counter incremented inside the task-creation transaction produces the per-project number
for `KEY-N` (FR-F-02). The alternative — `MAX(number) + 1` — is a race under concurrent
creation and would hand two tasks the same number. The counter is read and incremented in
one statement under the transaction's write lock, which makes collisions impossible. It is
a controlled redundancy: the invariant `task_sequence >= MAX(tasks.number)` is asserted by a test.

### 6.2 `tasks.path` and `tasks.depth`

Both are derivable by walking `parent_task_id`. They are stored because all three of the
hierarchy requirements become trivial and cheap with them:

- **Whole subtree** (FR-F-08) → one indexed prefix scan instead of a recursive CTE, which SQLite and Postgres optimise very differently.
- **Cycle prevention** (FR-F-06) → `newParent.path.includes(task.id)` — an O(1) string test rather than a walk to the root.
- **Depth cap** (FR-F-05) → a `CHECK` constraint the database enforces on its own.

The cost is that re-parenting must rewrite the `path` of the moved node and its descendants —
one `UPDATE … WHERE path LIKE '/old/%'` inside the same transaction. Re-parenting is rare;
reading the tree happens on every board render. The trade is made knowingly in favour of reads.

---

## 7. Seed data

The seed builds a narrative workspace so the application is never empty and the demo has
something to show:

- One organisation, **Northwind Labs**, with five people covering every role (owner, admin, PM, two developers, one viewer).
- Two projects: **TaskForge Platform** (`TFG`) with a 4-column board, and **Mobile Revamp** (`MOB`).
- ~40 work items spanning all five types, including a three-level epic → story → subtask tree.
- Threaded comments with mentions, attachments, a populated activity trail and unread notifications.
- Deterministic IDs, so tests can reference `TFG-12` directly.

---

## 8. Migration strategy

- Migrations are **generated** by `drizzle-kit` from the TypeScript schema and committed — never hand-edited.
- Forward-only. A mistake is corrected by a new migration, never by rewriting a released one.
- Every migration is applied to a scratch database in CI and the resulting schema is diffed against the declared schema; drift fails the build.
- The PostgreSQL switch is a driver change plus a regenerated migration set; the schema definitions are shared. Divergences that cannot be shared are recorded in ADR-004.
