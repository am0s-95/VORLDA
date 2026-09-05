CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project_id` text NOT NULL,
	`hash` text NOT NULL,
	`name` text NOT NULL,
	`scopes` text NOT NULL,
	`max_charge` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tokens_hash` ON `api_tokens` (`hash`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`source` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_assets_project_time` ON `assets` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `checkouts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`mode` text NOT NULL,
	`kind` text NOT NULL,
	`plan_id` text,
	`amount_cents` integer NOT NULL,
	`grant_micros` integer NOT NULL,
	`provider_id` text,
	`url` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_checkouts_owner` ON `checkouts` (`owner`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`piece_id` text,
	`author` text NOT NULL,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_comments_project_time` ON `comments` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`status` text NOT NULL,
	`input` text NOT NULL,
	`provider_job_id` text,
	`poll_url` text,
	`output_asset_id` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_project_status` ON `jobs` (`project_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_jobs_operation` ON `jobs` (`operation_id`);--> statement-breakpoint
CREATE TABLE `ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`mode` text NOT NULL,
	`project_id` text,
	`operation_id` text,
	`event_key` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`description` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ledger_event` ON `ledger` (`event_key`);--> statement-breakpoint
CREATE INDEX `idx_ledger_owner_mode_time` ON `ledger` (`owner`,`mode`,`created_at`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_members_project_email` ON `members` (`project_id`,`email`);--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`nonce` text NOT NULL,
	`mode` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`from_subscription` integer NOT NULL,
	`from_topup` integer NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_operations_quote` ON `operations` (`quote_id`);--> statement-breakpoint
CREATE INDEX `idx_operations_owner_created` ON `operations` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`processed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`graph` text NOT NULL,
	`draft` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_projects_owner_updated` ON `projects` (`owner`,`updated_at`);--> statement-breakpoint
CREATE TABLE `publications` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`owner` text NOT NULL,
	`graph` text NOT NULL,
	`revision` integer NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_publications_project` ON `publications` (`project_id`);--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project_id` text NOT NULL,
	`revision` integer NOT NULL,
	`mode` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`amount` integer NOT NULL,
	`details` text NOT NULL,
	`pricing_revision` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "quote_amount" CHECK("quotes"."amount" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_quotes_owner_expiry` ON `quotes` (`owner`,`expires_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`graph` text NOT NULL,
	`label` text NOT NULL,
	`revision` integer NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_snapshots_project_revision` ON `snapshots` (`project_id`,`revision`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`publication_id` text NOT NULL,
	`piece_id` text NOT NULL,
	`data` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_submissions_project_time` ON `submissions` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`mode` text NOT NULL,
	`plan_id` text NOT NULL,
	`status` text NOT NULL,
	`customer_id` text NOT NULL,
	`grant_micros` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_subscriptions_owner_mode` ON `subscriptions` (`owner`,`mode`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`mode` text NOT NULL,
	`subscription` integer DEFAULT 0 NOT NULL,
	`topup` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "wallet_nonnegative" CHECK("wallets"."subscription" >= 0 AND "wallets"."topup" >= 0),
	CONSTRAINT "wallet_mode" CHECK("wallets"."mode" IN ('test','live'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_wallets_owner_mode` ON `wallets` (`owner`,`mode`);