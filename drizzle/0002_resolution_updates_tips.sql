CREATE TABLE `post_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_updates_post_created` ON `post_updates` (`post_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `write_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`author_key` text NOT NULL,
	`request_key` text,
	`signature` text NOT NULL,
	`response` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_receipts_author_request` ON `write_receipts` (`author_key`,`request_key`);--> statement-breakpoint
ALTER TABLE `posts` ADD `accepted_answer_id` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `resolved_at` text;