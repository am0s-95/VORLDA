CREATE TABLE `payload_objects` (
	`object_key` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`scope` text NOT NULL,
	`sha256` text DEFAULT '' NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "payload_bytes_nonnegative" CHECK("payload_objects"."bytes" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_payload_objects_owner` ON `payload_objects` (`owner`);--> statement-breakpoint
CREATE INDEX `idx_payload_scope_hash` ON `payload_objects` (`scope`,`sha256`);--> statement-breakpoint
CREATE TABLE `promo_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`mode` text NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "promo_nonnegative" CHECK("promo_balances"."balance" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_promo_owner_mode` ON `promo_balances` (`owner`,`mode`);--> statement-breakpoint
CREATE TABLE `promotion_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`email_key` text NOT NULL,
	`mode` text NOT NULL,
	`campaign` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_claim_owner` ON `promotion_claims` (`owner`,`mode`,`campaign`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_claim_email` ON `promotion_claims` (`email_key`,`mode`,`campaign`);--> statement-breakpoint
CREATE INDEX `idx_claim_campaign_time` ON `promotion_claims` (`mode`,`campaign`,`created_at`);--> statement-breakpoint
CREATE TABLE `request_limits` (
	`owner` text NOT NULL,
	`bucket` text NOT NULL,
	`started_at` integer NOT NULL,
	`requests` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_request_limits_owner_bucket` ON `request_limits` (`owner`,`bucket`);--> statement-breakpoint
CREATE TABLE `storage_indexes` (
	`owner` text PRIMARY KEY NOT NULL,
	`indexed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `template_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`mode` text NOT NULL,
	`request_id` text NOT NULL,
	`template_id` text NOT NULL,
	`version` integer NOT NULL,
	`project_id` text NOT NULL,
	`amount` integer NOT NULL,
	`from_promo` integer NOT NULL,
	`from_subscription` integer NOT NULL,
	`from_topup` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_purchase_request` ON `template_purchases` (`owner`,`mode`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_purchase_entitlement` ON `template_purchases` (`owner`,`mode`,`template_id`,`version`);