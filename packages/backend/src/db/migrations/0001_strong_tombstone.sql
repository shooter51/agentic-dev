CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`roles` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`jti` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`replaced_by` text,
	`ip` text,
	`user_agent` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `refresh_tokens_user_idx` ON `refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_exp_idx` ON `refresh_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_replaced_idx` ON `refresh_tokens` (`replaced_by`);--> statement-breakpoint
CREATE TABLE `auth_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`event` text NOT NULL,
	`user_id` text,
	`email_hash` text,
	`ip` text,
	`user_agent` text,
	`details` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_audit_user_created_idx` ON `auth_audit_log` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `auth_audit_event_created_idx` ON `auth_audit_log` (`event`,`created_at`);