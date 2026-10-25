# System Architecture — TaskForge

| | |
| --- | --- |
| **Version** | 1.0 |
| **Status** | Awaiting sign-off |
| **Notation** | C4 model (context → containers → components) |

---

## 1. Architectural drivers

The design is shaped by five forces, in priority order. Where they conflict, the higher one wins.

| # | Driver | Consequence |
| --- | --- | --- |
| 1 | **Correctness under concurrency** — many users on one board | Optimistic concurrency, transactional audit, convergent ordering |
| 2 | **Security and tenant isolation** | Every query scoped by organisation; one central authorization gate |
| 3 | **Real-time responsiveness** | Optimistic UI with authoritative server events; sub-200 ms propagation |
| 4 | **Maintainability** | Strict layering, shared contracts, no logic in controllers |
| 5 | **Zero-friction setup** | Embedded database, two commands, no external services |

---

## 2. C4 Level 1 — System context

```
        ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
        │ Org Admin    │        │ Project Mgr  │        │ Developer /  │
        │ (P1)         │        │ (P2)         │        │ Contributor  │
        └──────┬───────┘        └──────┬───────┘        └──────┬───────┘
               │  HTTPS / WSS          │                       │
               └───────────────┬───────┴───────────────────────┘
                               ▼
                   ┌───────────────────────────┐
                   │        TaskForge          │
                   │  work management platform │
                   └─────────────┬─────────────┘
                                 │
                   ┌─────────────┴─────────────┐
                   │  Relational datastore     │
                   │  SQLite (dev) / PG (prod) │
                   └───────────────────────────┘
```

No external systems. Email, SSO and object storage are deliberately absent in v1 (SRS §7),
which removes every third-party account from the reviewer's setup path.

---

## 3. C4 Level 2 — Containers

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Browser                                                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  apps/web — React 19 SPA (Vite)                                      │  │
│  │  routing · feature modules · TanStack Query cache · Zustand UI state  │  │
│  │  socket client · dnd-kit board · design system                        │  │
│  └───────────────┬──────────────────────────────┬───────────────────────┘  │
└──────────────────┼──────────────────────────────┼──────────────────────────┘
                   │ REST /api/v1 (JSON)          │ WebSocket (Socket.IO)
                   ▼                              ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  apps/api — Node 20 · Express 5 · TypeScript (strict)                      │
│                                                                            │
│   HTTP edge          ── helmet · cors · requestId · rateLimit · pino       │
│   Routing            ── /api/v1/* · zod validation · openapi generation    │
│   Authentication     ── access-token verify · session context              │
│   Authorization      ── policy engine · permission catalogue               │
│   Services           ── business rules · transactions · event emission     │
│   Repositories       ── Drizzle queries · tenant scoping                   │
│   Realtime gateway   ── rooms · presence · typed event publisher           │
└───────────────┬────────────────────────────────────────────────────────────┘
                │ Drizzle ORM (typed SQL)
                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  Datastore — SQLite (WAL) in dev · PostgreSQL 16 in prod · same schema     │
│  Blob store — content-addressed files on disk (SHA-256), served via API    │
└────────────────────────────────────────────────────────────────────────────┘
                ▲
                │  types · zod schemas · event contracts · permission matrix
┌───────────────┴────────────────────────────────────────────────────────────┐
│  packages/shared — consumed by BOTH api and web, compiled once             │
└────────────────────────────────────────────────────────────────────────────┘
```

**Why a shared contracts package is the keystone.** The Zod schema that validates a request
body on the server is the same object that types the form on the client and generates the
OpenAPI document. An API change that the client has not accounted for becomes a *compile
error*, not a runtime bug found by a user. This single decision is what makes the codebase
enterprise-grade rather than merely large.

---

## 4. C4 Level 3 — API components and layering

```
   Request
      │
      ▼
 ┌──────────────┐   HTTP concerns only: parse, validate, shape the response.
 │  Controller  │   Never contains business rules. Never touches the database.
 └──────┬───────┘
        ▼
 ┌──────────────┐   Business rules, invariants, orchestration, transactions.
 │   Service    │   Emits domain events. Unit-testable with no HTTP involved.
 └──────┬───────┘
        ▼
 ┌──────────────┐   Typed queries. Every query takes the tenant scope.
 │  Repository  │   Returns domain rows; knows nothing about HTTP or sockets.
 └──────┬───────┘
        ▼
 ┌──────────────┐
 │  Drizzle/DB  │
 └──────────────┘
```

**Layering rules, enforced by `dependency-cruiser` in CI:**

1. A layer may import only from the layer directly beneath it and from `shared`.
2. Controllers may not import repositories. Services may not import Express types.
3. Nothing may import the realtime gateway except services, and only through the publisher interface.
4. No cycles anywhere in the graph.

**Module layout (feature-first, not type-first):**

```
apps/api/src/
├─ config/            env parsing (zod-validated), constants
├─ db/                schema/, migrations/, client, transaction helper
├─ core/              errors, result types, pagination, logger, ids, lexorank
├─ auth/              tokens, password hashing, session service, guards
├─ rbac/              permission catalogue, role matrix, policy engine
├─ realtime/          gateway, rooms, presence, typed publisher
├─ modules/
│  ├─ organizations/  controller · service · repository · routes · schemas
│  ├─ users/
│  ├─ projects/
│  ├─ boards/
│  ├─ tasks/
│  ├─ comments/
│  ├─ attachments/
│  ├─ activity/
│  └─ notifications/
├─ app.ts             composition root — wires everything, exports the app
└─ server.ts          process lifecycle: listen, graceful shutdown
```

Each module owns its vertical slice. Adding "sprints" later means adding one folder, not
editing seven shared files.

---

## 5. Technology stack and rationale

| Layer | Choice | Why this, over the obvious alternative |
| --- | --- | --- |
| Language | **TypeScript 5.9, strict** | Shared types across the API boundary are the single biggest defect-prevention lever in a full-stack codebase. |
| Runtime | **Node.js 20 LTS** | Same language both sides; mature WebSocket ecosystem; matches the brief's allowed stack. |
| HTTP | **Express 5** | Native async error propagation (the reason to prefer it over Express 4); minimal, well-understood, easy for a reviewer to read. |
| ORM | **Drizzle** | TypeScript-native schema with no code generation step and no query-engine binary. Prisma was rejected: it downloads platform-specific engines, which makes clone-and-run fragile (ADR-003). |
| Database | **SQLite (WAL) → PostgreSQL 16** | Zero-install for the reviewer; identical Drizzle schema targets Postgres for production (ADR-004). |
| Validation | **Zod 4** | One schema serves validation, static types and OpenAPI generation. |
| Realtime | **Socket.IO 4** | Rooms, acknowledgements, automatic reconnection and a pluggable adapter for horizontal scaling. Raw `ws` would mean rebuilding all four. |
| Auth | **JWT access + rotating refresh** | Stateless reads; revocable sessions; reuse detection catches stolen tokens (ADR-002). |
| Frontend | **React 19 + Vite 7** | Allowed by the brief; keeps the API independently deployable, unlike a Next.js merge of the two tiers (ADR-005). |
| Server state | **TanStack Query 5** | Caching, deduplication, background refetch and — critically — a cache that socket events can surgically patch. |
| UI state | **Zustand** | Board filters, panel state and presence are ephemeral UI concerns; they do not belong in the server cache. |
| Drag & drop | **dnd-kit** | The only mainstream option with a first-class keyboard sensor, which is what makes FR-E-06 and NFR-16 achievable. |
| Testing | **Vitest · Supertest · Playwright** | Unit, integration and true multi-browser end-to-end in one toolchain. |
| Logging | **pino** | Structured JSON, negligible overhead, request-scoped child loggers. |

---

## 6. Authorization architecture

RBAC is implemented as a **policy engine**, not as scattered `if (role === 'admin')` checks.

```
                  ┌──────────────────────────────────────────┐
  Request ───────▶│ authenticate()   → AuthContext           │
                  │   { userId, orgId, orgRole, sessionId }  │
                  └───────────────┬──────────────────────────┘
                                  ▼
                  ┌──────────────────────────────────────────┐
                  │ authorize(Permission.TASK_UPDATE)        │
                  │  1. resolve resource → its project/org   │
                  │  2. load project role (cached per req)   │
                  │  3. effective = orgGrants ∪ projectGrants│
                  │  4. allow ⟺ permission ∈ effective       │
                  └───────────────┬──────────────────────────┘
                                  ▼
                            Controller → Service
```

**Permission catalogue** (excerpt — the full matrix lives in `packages/shared/src/rbac`):

| Permission | OWNER | ADMIN | MEMBER | GUEST | PM | DEV | VIEWER |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `org.member.invite` | ✓ | ✓ | – | – | – | – | – |
| `org.member.role.update` | ✓ | ✓ | – | – | – | – | – |
| `project.create` | ✓ | ✓ | ✓ | – | – | – | – |
| `project.delete` | ✓ | – | – | – | – | – | – |
| `project.settings.update` | ✓ | ✓ | – | – | ✓ | – | – |
| `project.member.manage` | ✓ | ✓ | – | – | ✓ | – | – |
| `board.configure` | ✓ | ✓ | – | – | ✓ | – | – |
| `task.create` · `task.update` · `task.move` | ✓ | ✓ | – | – | ✓ | ✓ | – |
| `task.delete` | ✓ | ✓ | – | – | ✓ | own | – |
| `comment.create` | ✓ | ✓ | – | – | ✓ | ✓ | – |
| `comment.delete.any` | ✓ | ✓ | – | – | ✓ | – | – |
| `project.read` | ✓ | ✓ | member | invited | ✓ | ✓ | ✓ |

*Org columns grant across every project in the tenant; project columns grant within one project.*

Two properties fall out of this design:

- **No forgotten check.** Every route declares its permission; a CI script fails the build
  if a mutating route has none. Sockets run the same `authorize()` before joining a room.
- **Non-existence over refusal.** A resource in another tenant returns **404**, never 403 —
  refusing to confirm existence (NFR-08).

---

## 7. Real-time architecture

### 7.1 Event flow

```
User A: drag card ──▶ optimistic cache update ──▶ POST /tasks/:id/move
                                                         │
                                          ┌──────────────▼──────────────┐
                                          │ TaskService.move()          │
                                          │  BEGIN TRANSACTION          │
                                          │   · version check (409?)    │
                                          │   · update position/column  │
                                          │   · insert activity row     │
                                          │   · insert notifications    │
                                          │  COMMIT                     │
                                          │  publish(task.moved)        │ ← after commit only
                                          └──────────────┬──────────────┘
                                                         ▼
                                       io.to(`project:{id}`).emit('task.moved', envelope)
                                                         │
                    ┌────────────────────────────────────┴───────────────────────┐
                    ▼                                                            ▼
        User A: actorId === me → ignore (already applied)      User B: patch query cache
```

**Events are published after commit, never inside the transaction.** Emitting inside a
transaction that later rolls back would show other users a change that never happened.

### 7.2 Event envelope

Every event, without exception:

```ts
type DomainEvent<T extends EventName> = {
  type: T;                    // 'task.moved'
  version: 1;                 // envelope version, for forward compatibility
  actorId: string;            // who caused it — enables self-echo suppression
  orgId: string;
  projectId: string | null;
  occurredAt: string;         // ISO-8601 UTC
  payload: EventPayloads[T];  // typed per event in packages/shared
};
```

### 7.3 Rooms and subscription

| Room | Joined when | Receives |
| --- | --- | --- |
| `user:{userId}` | On connect | Notifications addressed to that person |
| `org:{orgId}` | On connect | Membership and org-level changes |
| `project:{projectId}` | On opening a board, **after** `authorize(project.read)` | All work-item, board and comment events |

### 7.4 Convergence strategy

The client cache is patched by events, which risks drift. Three mechanisms keep it honest:

1. **Self-echo suppression** — events whose `actorId` is the current user are discarded; the optimistic update already applied them.
2. **Refetch on reconnect** (FR-J-06) — after any disconnect the board refetches rather than replaying a missed event log. Simpler and strictly more correct than an at-least-once replay buffer.
3. **Version-stamped writes** — a mutation carrying a stale `version` is rejected with 409 and the server's current state, which the client adopts.

### 7.5 Horizontal scaling

Services publish through a `RealtimePublisher` interface, not through `io` directly. In a
single-instance deployment the implementation is the in-process Socket.IO server; behind
multiple instances it becomes the Redis adapter. No service code changes (NFR-04).

---

## 8. API conventions

| Concern | Convention |
| --- | --- |
| Versioning | Path-based: `/api/v1`. Breaking changes ship as `/api/v2`. |
| Naming | Plural nouns, nested only one level: `/projects/:id/tasks`, then `/tasks/:id`. |
| Pagination | Cursor-based on every collection: `?limit=50&cursor=…` → `{ data, nextCursor }`. Offset pagination is banned — it skips and repeats rows under concurrent inserts. |
| Errors | `{ error: { code, message, details?, requestId } }` with a stable machine-readable `code`. |
| Concurrency | `version` integer on mutable resources; mismatched write → `409 VERSION_CONFLICT` plus current state. |
| Idempotency | `Idempotency-Key` honoured on create endpoints to survive client retries. |
| Partial updates | `PATCH` with a partial Zod schema; `undefined` means "leave alone", `null` means "clear". |
| Bulk | `POST /tasks/bulk` for multi-item operations, transactional, all-or-nothing. |
| Documentation | OpenAPI 3.1 generated from the Zod schemas and served at `/api/v1/docs`. |

---

## 9. Frontend architecture

```
apps/web/src/
├─ app/           router, providers, error boundary, app shell
├─ shared/        design system, hooks, api client, socket client, utils
├─ features/
│  ├─ auth/       login, register, session bootstrap, silent refresh
│  ├─ org/        members, roles, invitations
│  ├─ projects/   list, create, settings
│  ├─ board/      kanban, list view, columns, cards, dnd, filters
│  ├─ task/       detail panel, subtasks, attachments, activity timeline
│  ├─ comments/   thread, composer, mentions
│  └─ notifications/
└─ main.tsx
```

**State ownership is explicit** — the usual source of frontend rot is ambiguity here:

| Kind of state | Owner | Example |
| --- | --- | --- |
| Server data | TanStack Query | Board, tasks, comments, members |
| Realtime patches | Query cache, via one reducer | `task.moved` → patch the board query |
| Ephemeral UI | Zustand | Open panel, filter values, drag state |
| URL state | React Router | Selected task, active view, board id |
| Per-user preference | `localStorage` behind a typed hook | Theme, last view mode |

**Optimistic mutation pattern** used for every board interaction: snapshot the cache, apply
the change, fire the request, roll back and toast on failure, reconcile with the server
response on success. The card never waits for the network.

---

## 10. Security architecture

| Control | Implementation |
| --- | --- |
| Password storage | bcrypt, cost 12, per-password salt |
| Session model | 15-minute access JWT; 30-day refresh token stored as a SHA-256 hash, rotated on every use |
| Stolen-token detection | Refresh token | Opaque 48-byte random, SHA-256 at rest, rotated on every use with reuse detection. **Currently held in `localStorage` on the client — see backlog P1-1.** The `HttpOnly; Secure; SameSite=Strict` cookie this table previously claimed is not implemented. |
| Transport | HTTPS/WSS in production; `Secure`, `HttpOnly`, `SameSite=Strict` on the refresh cookie |
| Authorization | Central policy engine, §6; identical on REST and WebSocket |
| Tenant isolation | Every repository method takes `orgId`; cross-tenant access returns 404 |
| Input validation | Zod at every boundary, including socket payloads |
| SQL injection | SQL injection | Every query goes through Drizzle bind parameters; no string-built SQL exists. This holds by discipline — there is no ESLint configuration in the repository, so no lint rule enforces it. |
| Upload safety | Size cap before buffering, MIME sniffed from bytes, stored outside the web root under a hashed name, served only through an authorized route |
| Headers | Helmet: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy` |
| Rate limiting | Per-IP on register and login only (`auth.routes.ts`). There is no per-user write limiter and no global limiter — see backlog P2. |
| Secrets | Environment-only, validated at boot; the process refuses to start with a default secret when `NODE_ENV=production` |

---

## 11. Observability and operations

- **Logging** — pino JSON; a request-scoped child logger carries `requestId`, `userId`, `orgId`; one completion line per request with method, route, status and duration.
- **Correlation** — `X-Request-Id` accepted from the edge or generated, echoed in the response and attached to every error envelope.
- **Health** — `/healthz` (process alive) and `/readyz` (migrations applied, database reachable) for container orchestration.
- **Metrics hooks** — timing and counters emitted through a thin interface so Prometheus can be added without touching call sites.
- **Graceful shutdown** — stop accepting connections, drain in-flight requests, close sockets, close the database, exit.

---

## 12. Deployment topology

```
        Internet
           │ HTTPS / WSS
    ┌──────▼──────────┐
    │  Reverse proxy  │  TLS termination, WebSocket upgrade passthrough
    └──────┬──────────┘
           ├──────────────▶ static bundle (apps/web/dist) on a CDN or the proxy
           └──────────────▶ apps/api (N instances)
                                   ├── PostgreSQL 16 (managed, backed up)
                                   ├── Redis (only when N > 1, for the socket adapter)
                                   └── blob volume (attachments)
```

Development collapses this to two processes and a file: Vite on 5173, API on 4000,
SQLite on disk. **The same codebase, no conditional branches** — only environment variables differ.

---

## 13. Architecture decision records

| ADR | Decision | Status |
| --- | --- | --- |
| [ADR-001](adr/ADR-001-monorepo-shared-contracts.md) | npm-workspaces monorepo with a shared contracts package | Accepted |
| [ADR-002](adr/ADR-002-auth-token-strategy.md) | JWT access tokens + rotating refresh tokens with reuse detection | Accepted |
| [ADR-003](adr/ADR-003-drizzle-over-prisma.md) | Drizzle ORM in preference to Prisma | Accepted |
| [ADR-004](adr/ADR-004-sqlite-to-postgres.md) | SQLite for development, PostgreSQL-compatible schema | Accepted |
| [ADR-005](adr/ADR-005-spa-over-nextjs.md) | React SPA in preference to Next.js | Accepted |
| [ADR-006](adr/ADR-006-lexorank-ordering.md) | Sparse fractional ranking for board ordering | Accepted |
| [ADR-007](adr/ADR-007-realtime-convergence.md) | Refetch-on-reconnect in preference to an event replay log | Accepted |
