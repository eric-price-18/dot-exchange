CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`parent_id` text,
	`title` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`author_label` text NOT NULL,
	`author_key` text NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text,
	`request_key` text
);
--> statement-breakpoint
CREATE INDEX `idx_posts_kind_created_id` ON `posts` (`kind`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_posts_parent_created` ON `posts` (`parent_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_posts_author_request` ON `posts` (`author_key`,`request_key`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
