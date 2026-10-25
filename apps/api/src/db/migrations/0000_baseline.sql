CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text,
	`actor_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`changes_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "activities_entity_type_ck" CHECK("activities"."entity_type" in ('PROJECT','BOARD','COLUMN','TASK','COMMENT','ATTACHMENT','MEMBER'))
);
--> statement-breakpoint
CREATE INDEX `activities_project_created_idx` ON `activities` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activities_entity_idx` ON `activities` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activities_actor_idx` ON `activities` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`task_id` text NOT NULL,
	`blob_hash` text NOT NULL,
	`file_name` text NOT NULL,
	`uploaded_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blob_hash`) REFERENCES `blobs`(`hash`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `attachments_task_idx` ON `attachments` (`task_id`);--> statement-breakpoint
CREATE INDEX `attachments_blob_idx` ON `attachments` (`blob_hash`);--> statement-breakpoint
CREATE TABLE `blobs` (
	`hash` text PRIMARY KEY NOT NULL,
	`size_bytes` integer NOT NULL,
	`mime_type` text NOT NULL,
	`storage_path` text NOT NULL,
	`ref_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "blobs_ref_count_ck" CHECK("blobs"."ref_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE `board_columns` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`status_id` text NOT NULL,
	`name` text NOT NULL,
	`position` real NOT NULL,
	`wip_limit` integer,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`status_id`) REFERENCES `workflow_statuses`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "board_columns_wip_ck" CHECK("board_columns"."wip_limit" is null or "board_columns"."wip_limit" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `board_columns_board_status_uq` ON `board_columns` (`board_id`,`status_id`);--> statement-breakpoint
CREATE INDEX `board_columns_board_pos_idx` ON `board_columns` (`board_id`,`position`);--> statement-breakpoint
CREATE TABLE `boards` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `boards_project_idx` ON `boards` (`project_id`);--> statement-breakpoint
CREATE TABLE `comment_mentions` (
	`comment_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`comment_id`, `user_id`),
	FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comment_mentions_user_idx` ON `comment_mentions` (`user_id`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`task_id` text NOT NULL,
	`author_id` text,
	`parent_comment_id` text,
	`body` text NOT NULL,
	`edited_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "comments_no_self_parent_ck" CHECK("comments"."parent_comment_id" is null or "comments"."parent_comment_id" <> "comments"."id")
);
--> statement-breakpoint
CREATE INDEX `comments_task_created_idx` ON `comments` (`task_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `comments_parent_idx` ON `comments` (`parent_comment_id`);--> statement-breakpoint
CREATE TABLE `labels` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `labels_project_name_uq` ON `labels` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`actor_id` text,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`project_id` text,
	`task_id` text,
	`comment_id` text,
	`read_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notifications_type_ck" CHECK("notifications"."type" in ('TASK_ASSIGNED','TASK_MOVED','COMMENT_CREATED','MENTIONED','PROJECT_INVITED','DUE_SOON')),
	CONSTRAINT "notifications_not_self_ck" CHECK("notifications"."actor_id" is null or "notifications"."actor_id" <> "notifications"."user_id")
);
--> statement-breakpoint
CREATE INDEX `notifications_user_read_idx` ON `notifications` (`user_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `organization_members` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'MEMBER' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`joined_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "org_members_role_ck" CHECK("organization_members"."role" in ('OWNER','ADMIN','MEMBER','GUEST')),
	CONSTRAINT "org_members_status_ck" CHECK("organization_members"."status" in ('ACTIVE','SUSPENDED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `org_members_org_user_uq` ON `organization_members` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `org_members_user_idx` ON `organization_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `org_members_role_idx` ON `organization_members` (`organization_id`,`role`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "organizations_plan_ck" CHECK("organizations"."plan" in ('free','team','enterprise'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_uq` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `project_members` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'DEVELOPER' NOT NULL,
	`added_by` text,
	`joined_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "project_members_role_ck" CHECK("project_members"."role" in ('PROJECT_MANAGER','DEVELOPER','VIEWER'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_members_project_user_uq` ON `project_members` (`project_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `project_members_user_idx` ON `project_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`lead_id` text,
	`task_sequence` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`created_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_org_key_uq` ON `projects` (`organization_id`,`key`);--> statement-breakpoint
CREATE INDEX `projects_org_archived_idx` ON `projects` (`organization_id`,`archived_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`family_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`user_agent` text,
	`ip_address` text,
	`expires_at` text NOT NULL,
	`rotated_at` text,
	`revoked_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_uq` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `sessions_user_org_idx` ON `sessions` (`user_id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `sessions_family_idx` ON `sessions` (`family_id`);--> statement-breakpoint
CREATE TABLE `task_labels` (
	`task_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `label_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_labels_label_idx` ON `task_labels` (`label_id`);--> statement-breakpoint
CREATE TABLE `task_watchers` (
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`task_id`, `user_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_watchers_user_idx` ON `task_watchers` (`user_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text NOT NULL,
	`board_id` text NOT NULL,
	`column_id` text NOT NULL,
	`status_id` text NOT NULL,
	`number` integer NOT NULL,
	`type` text DEFAULT 'TASK' NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`priority` text DEFAULT 'MEDIUM' NOT NULL,
	`assignee_id` text,
	`reporter_id` text,
	`parent_task_id` text,
	`path` text DEFAULT '/' NOT NULL,
	`depth` integer DEFAULT 0 NOT NULL,
	`position` real NOT NULL,
	`story_points` integer,
	`start_date` text,
	`due_date` text,
	`resolved_at` text,
	`archived_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`column_id`) REFERENCES `board_columns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`status_id`) REFERENCES `workflow_statuses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tasks_type_ck" CHECK("tasks"."type" in ('EPIC','STORY','TASK','BUG','SUBTASK')),
	CONSTRAINT "tasks_priority_ck" CHECK("tasks"."priority" in ('LOWEST','LOW','MEDIUM','HIGH','CRITICAL')),
	CONSTRAINT "tasks_depth_ck" CHECK("tasks"."depth" >= 0 and "tasks"."depth" <= 4),
	CONSTRAINT "tasks_points_ck" CHECK("tasks"."story_points" is null or "tasks"."story_points" >= 0),
	CONSTRAINT "tasks_dates_ck" CHECK("tasks"."start_date" is null or "tasks"."due_date" is null or "tasks"."due_date" >= "tasks"."start_date"),
	CONSTRAINT "tasks_no_self_parent_ck" CHECK("tasks"."parent_task_id" is null or "tasks"."parent_task_id" <> "tasks"."id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_project_number_uq` ON `tasks` (`project_id`,`number`);--> statement-breakpoint
CREATE INDEX `tasks_column_position_idx` ON `tasks` (`column_id`,`position`);--> statement-breakpoint
CREATE INDEX `tasks_project_archived_idx` ON `tasks` (`project_id`,`archived_at`);--> statement-breakpoint
CREATE INDEX `tasks_assignee_resolved_idx` ON `tasks` (`assignee_id`,`resolved_at`);--> statement-breakpoint
CREATE INDEX `tasks_parent_idx` ON `tasks` (`parent_task_id`);--> statement-breakpoint
CREATE INDEX `tasks_path_idx` ON `tasks` (`path`);--> statement-breakpoint
CREATE INDEX `tasks_project_due_idx` ON `tasks` (`project_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `user_board_preferences` (
	`user_id` text NOT NULL,
	`board_id` text NOT NULL,
	`view_mode` text DEFAULT 'KANBAN' NOT NULL,
	`filters_json` text DEFAULT '{}' NOT NULL,
	PRIMARY KEY(`user_id`, `board_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_board_pref_view_ck" CHECK("user_board_preferences"."view_mode" in ('KANBAN','LIST'))
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`job_title` text,
	`avatar_color` text DEFAULT '#6366f1' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `workflow_statuses` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`position` real NOT NULL,
	`is_initial` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "workflow_statuses_category_ck" CHECK("workflow_statuses"."category" in ('TODO','IN_PROGRESS','DONE'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_statuses_project_name_uq` ON `workflow_statuses` (`project_id`,`name`);--> statement-breakpoint
CREATE INDEX `workflow_statuses_project_pos_idx` ON `workflow_statuses` (`project_id`,`position`);