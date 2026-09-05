CREATE TABLE `member_budgets` (
	`member_id` text PRIMARY KEY NOT NULL,
	`monthly_limit` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plan_trials` (
	`owner` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `production_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`actor` text NOT NULL,
	`project_id` text NOT NULL,
	`request_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`input` text NOT NULL,
	`amount` integer NOT NULL,
	`from_subscription` integer NOT NULL,
	`from_topup` integer NOT NULL,
	`provider_id` text,
	`output` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tasks_actor_request` ON `production_tasks` (`actor`,`request_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_owner_status` ON `production_tasks` (`owner`,`status`);--> statement-breakpoint
CREATE INDEX `idx_tasks_project_time` ON `production_tasks` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `project_policies` (
	`project_id` text PRIMARY KEY NOT NULL,
	`require_review` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `publication_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`revision` integer NOT NULL,
	`author` text NOT NULL,
	`decision` text NOT NULL,
	`note` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reviews_project_revision_author` ON `publication_reviews` (`project_id`,`revision`,`author`);--> statement-breakpoint
CREATE TABLE `resource_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project_id` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reservations_owner` ON `resource_reservations` (`owner`);--> statement-breakpoint
CREATE TABLE `studio_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_resources_owner_kind` ON `studio_resources` (`owner`,`kind`);--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `paid_until` integer DEFAULT 0 NOT NULL;