/**
 * TaskForge database schema — the executable form of docs/04-DATA-MODEL.md.
 *
 * Written against Drizzle's SQLite dialect but restricted to constructs that
 * PostgreSQL also supports (ADR-004), so the production migration is a driver
 * swap rather than a redesign.
 */
import { check, foreignKey, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/** Shorthand for the created/updated pair every mutable table carries. */
const timestamps = {
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
};

/* ────────────────────────────── identity & tenancy ────────────────────────── */

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  plan: text('plan').notNull().default('free'),
  ...timestamps,
}, (t) => [
  uniqueIndex('organizations_slug_uq').on(t.slug),
  check('organizations_plan_ck', sql`${t.plan} in ('free','team','enterprise')`),
]);

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  jobTitle: text('job_title'),
  avatarColor: text('avatar_color').notNull().default('#6366f1'),
  timezone: text('timezone').notNull().default('UTC'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  lastLoginAt: text('last_login_at'),
  ...timestamps,
}, (t) => [
  uniqueIndex('users_email_uq').on(t.email),
]);

export const organizationMembers = sqliteTable('organization_members', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('MEMBER'),
  status: text('status').notNull().default('ACTIVE'),
  joinedAt: text('joined_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
}, (t) => [
  uniqueIndex('org_members_org_user_uq').on(t.organizationId, t.userId),
  index('org_members_user_idx').on(t.userId),
  index('org_members_role_idx').on(t.organizationId, t.role),
  check('org_members_role_ck', sql`${t.role} in ('OWNER','ADMIN','MEMBER','GUEST')`),
  check('org_members_status_ck', sql`${t.status} in ('ACTIVE','SUSPENDED')`),
]);

/**
 * One row per refresh token. Rows sharing a `familyId` form a rotation chain;
 * presenting an already-rotated token revokes the whole family (ADR-002).
 */
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /**
   * A session is scoped to ONE workspace. Without this, refreshing a token
   * could silently hand back a token for a different organisation, and
   * suspending someone in one workspace would log them out of every other.
   */
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  familyId: text('family_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  expiresAt: text('expires_at').notNull(),
  rotatedAt: text('rotated_at'),
  revokedAt: text('revoked_at'),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
}, (t) => [
  uniqueIndex('sessions_token_hash_uq').on(t.tokenHash),
  index('sessions_user_idx').on(t.userId, t.expiresAt),
  index('sessions_user_org_idx').on(t.userId, t.organizationId),
  index('sessions_family_idx').on(t.familyId),
]);

/* ──────────────────────────── projects & board setup ──────────────────────── */

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  color: text('color').notNull().default('#6366f1'),
  leadId: text('lead_id').references(() => users.id, { onDelete: 'set null' }),
  /** Monotonic counter behind the KEY-N reference — DATA-MODEL §6.1. */
  taskSequence: integer('task_sequence').notNull().default(0),
  archivedAt: text('archived_at'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
}, (t) => [
  uniqueIndex('projects_org_key_uq').on(t.organizationId, t.key),
  index('projects_org_archived_idx').on(t.organizationId, t.archivedAt),
]);

export const projectMembers = sqliteTable('project_members', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('DEVELOPER'),
  addedBy: text('added_by').references(() => users.id, { onDelete: 'set null' }),
  joinedAt: text('joined_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
}, (t) => [
  uniqueIndex('project_members_project_user_uq').on(t.projectId, t.userId),
  index('project_members_user_idx').on(t.userId),
  check('project_members_role_ck', sql`${t.role} in ('PROJECT_MANAGER','DEVELOPER','VIEWER')`),
]);

export const boards = sqliteTable('boards', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  ...timestamps,
}, (t) => [
  index('boards_project_idx').on(t.projectId),
]);

export const workflowStatuses = sqliteTable('workflow_statuses', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category').notNull(),
  position: real('position').notNull(),
  isInitial: integer('is_initial', { mode: 'boolean' }).notNull().default(false),
}, (t) => [
  uniqueIndex('workflow_statuses_project_name_uq').on(t.projectId, t.name),
  index('workflow_statuses_project_pos_idx').on(t.projectId, t.position),
  check('workflow_statuses_category_ck', sql`${t.category} in ('TODO','IN_PROGRESS','DONE')`),
]);

export const boardColumns = sqliteTable('board_columns', {
  id: text('id').primaryKey(),
  boardId: text('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
  /**
   * Cascade, not restrict. A column without its status is meaningless, and a
   * RESTRICT here makes deleting a project impossible: the cascade from
   * `projects` reaches `workflow_statuses` and `board_columns` in an order
   * SQLite does not let us control. "You must say where these cards go" is a
   * business rule, so it lives in the service — not in a constraint that can
   * only express itself as a 500.
   */
  statusId: text('status_id').notNull().references(() => workflowStatuses.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: real('position').notNull(),
  wipLimit: integer('wip_limit'),
}, (t) => [
  uniqueIndex('board_columns_board_status_uq').on(t.boardId, t.statusId),
  index('board_columns_board_pos_idx').on(t.boardId, t.position),
  check('board_columns_wip_ck', sql`${t.wipLimit} is null or ${t.wipLimit} > 0`),
]);

export const labels = sqliteTable('labels', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull(),
}, (t) => [
  uniqueIndex('labels_project_name_uq').on(t.projectId, t.name),
]);

export const userBoardPreferences = sqliteTable('user_board_preferences', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  boardId: text('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
  viewMode: text('view_mode').notNull().default('KANBAN'),
  filtersJson: text('filters_json').notNull().default('{}'),
}, (t) => [
  primaryKey({ columns: [t.userId, t.boardId] }),
  check('user_board_pref_view_ck', sql`${t.viewMode} in ('KANBAN','LIST')`),
]);

/* ───────────────────────────────── work items ─────────────────────────────── */

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  /** Denormalized tenant column so isolation never depends on remembering a join. */
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  boardId: text('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
  columnId: text('column_id').notNull().references(() => boardColumns.id, { onDelete: 'cascade' }),
  statusId: text('status_id').notNull().references(() => workflowStatuses.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  type: text('type').notNull().default('TASK'),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  priority: text('priority').notNull().default('MEDIUM'),
  assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  reporterId: text('reporter_id').references(() => users.id, { onDelete: 'set null' }),
  parentTaskId: text('parent_task_id'),
  /** Materialised ancestry `/rootId/childId/` — DATA-MODEL §6.2. */
  path: text('path').notNull().default('/'),
  depth: integer('depth').notNull().default(0),
  position: real('position').notNull(),
  storyPoints: integer('story_points'),
  startDate: text('start_date'),
  dueDate: text('due_date'),
  resolvedAt: text('resolved_at'),
  archivedAt: text('archived_at'),
  /** Optimistic concurrency token — FR-F-14. */
  version: integer('version').notNull().default(1),
  ...timestamps,
}, (t) => [
  uniqueIndex('tasks_project_number_uq').on(t.projectId, t.number),
  // The board snapshot filters on board_id and orders by (column_id, position).
  // Without a leading board_id the plan was SCAN tasks — a full traversal of
  // every task in the database, across all tenants, filtered row by row.
  index('tasks_board_column_pos_idx').on(t.boardId, t.columnId, t.position),
  // Kept deliberately: positionsInColumn and the column-delete path filter on
  // column_id ALONE, which an index leading with board_id cannot serve.
  // Verified with EXPLAIN QUERY PLAN before removing it was considered.
  index('tasks_column_position_idx').on(t.columnId, t.position),
  index('tasks_project_archived_idx').on(t.projectId, t.archivedAt),
  index('tasks_assignee_resolved_idx').on(t.assigneeId, t.resolvedAt),
  index('tasks_parent_idx').on(t.parentTaskId),
  index('tasks_path_idx').on(t.path),
  index('tasks_project_due_idx').on(t.projectId, t.dueDate),
  check('tasks_type_ck', sql`${t.type} in ('EPIC','STORY','TASK','BUG','SUBTASK')`),
  check('tasks_priority_ck', sql`${t.priority} in ('LOWEST','LOW','MEDIUM','HIGH','CRITICAL')`),
  check('tasks_depth_ck', sql`${t.depth} >= 0 and ${t.depth} <= 4`),
  check('tasks_points_ck', sql`${t.storyPoints} is null or ${t.storyPoints} >= 0`),
  check('tasks_dates_ck', sql`${t.startDate} is null or ${t.dueDate} is null or ${t.dueDate} >= ${t.startDate}`),
  check('tasks_no_self_parent_ck', sql`${t.parentTaskId} is null or ${t.parentTaskId} <> ${t.id}`),
  /**
   * Self-reference: a subtask points at its parent, and deleting a parent
   * removes its subtree.
   *
   * CASCADE rather than SET NULL because the REPARENT strategy (FR-F-07) moves
   * the children onto their grandparent *before* the parent row is removed, so
   * they are no longer referencing it by the time the cascade fires. SET NULL
   * would silently defeat the CASCADE strategy instead — it orphans children
   * rather than deleting them.
   */
  foreignKey({ columns: [t.parentTaskId], foreignColumns: [t.id], name: 'tasks_parent_fk' }).onDelete('cascade'),
]);

export const taskLabels = sqliteTable('task_labels', {
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  labelId: text('label_id').notNull().references(() => labels.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.taskId, t.labelId] }),
  index('task_labels_label_idx').on(t.labelId),
]);

export const taskWatchers = sqliteTable('task_watchers', {
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
}, (t) => [
  primaryKey({ columns: [t.taskId, t.userId] }),
  index('task_watchers_user_idx').on(t.userId),
]);

/* ──────────────────────────────── attachments ─────────────────────────────── */

/** Content-addressed blobs: identical bytes are stored once (FR-G-02). */
export const blobs = sqliteTable('blobs', {
  hash: text('hash').primaryKey(),
  sizeBytes: integer('size_bytes').notNull(),
  mimeType: text('mime_type').notNull(),
  storagePath: text('storage_path').notNull(),
  refCount: integer('ref_count').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
}, (t) => [
  check('blobs_ref_count_ck', sql`${t.refCount} >= 0`),
]);

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  blobHash: text('blob_hash').notNull().references(() => blobs.hash, { onDelete: 'restrict' }),
  fileName: text('file_name').notNull(),
  uploadedBy: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
}, (t) => [
  index('attachments_task_idx').on(t.taskId),
  index('attachments_blob_idx').on(t.blobHash),
]);

/* ─────────────────────────────── collaboration ────────────────────────────── */

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  parentCommentId: text('parent_comment_id'),
  body: text('body').notNull(),
  editedAt: text('edited_at'),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
}, (t) => [
  index('comments_task_created_idx').on(t.taskId, t.createdAt),
  index('comments_parent_idx').on(t.parentCommentId),
  check('comments_no_self_parent_ck', sql`${t.parentCommentId} is null or ${t.parentCommentId} <> ${t.id}`),
  foreignKey({ columns: [t.parentCommentId], foreignColumns: [t.id], name: 'comments_parent_fk' }).onDelete('cascade'),
]);

export const commentMentions = sqliteTable('comment_mentions', {
  commentId: text('comment_id').notNull().references(() => comments.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.commentId, t.userId] }),
  index('comment_mentions_user_idx').on(t.userId),
]);

/* ────────────────────────── audit trail & notifications ───────────────────── */

/**
 * Append-only. The entity reference is polymorphic on purpose: an audit row must
 * outlive the row it describes, so it cannot carry a cascading foreign key
 * (DATA-MODEL §3.6).
 */
export const activities = sqliteTable('activities', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),
  changesJson: text('changes_json').notNull().default('{}'),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
}, (t) => [
  index('activities_project_created_idx').on(t.projectId, t.createdAt),
  index('activities_entity_idx').on(t.entityType, t.entityId, t.createdAt),
  index('activities_actor_idx').on(t.actorId, t.createdAt),
  check('activities_entity_type_ck',
    sql`${t.entityType} in ('PROJECT','BOARD','COLUMN','TASK','COMMENT','ATTACHMENT','MEMBER')`),
]);

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
  type: text('type').notNull(),
  message: text('message').notNull(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  commentId: text('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
  readAt: text('read_at'),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
}, (t) => [
  index('notifications_user_read_idx').on(t.userId, t.readAt, t.createdAt),
  check('notifications_type_ck',
    sql`${t.type} in ('TASK_ASSIGNED','TASK_MOVED','COMMENT_CREATED','MENTIONED','PROJECT_INVITED','DUE_SOON')`),
  /** The database itself refuses to notify you about your own action (FR-I-05). */
  check('notifications_not_self_ck', sql`${t.actorId} is null or ${t.actorId} <> ${t.userId}`),
]);

/* ─────────────────────────────── inferred types ───────────────────────────── */

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type Board = typeof boards.$inferSelect;
export type WorkflowStatus = typeof workflowStatuses.$inferSelect;
export type BoardColumn = typeof boardColumns.$inferSelect;
export type Label = typeof labels.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Blob = typeof blobs.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
