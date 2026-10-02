CREATE TABLE `acceptance_history` (
	`question_id` text NOT NULL,
	`revision` integer NOT NULL,
	`answer_id` text,
	`answer_revision` integer,
	`changed_at` text,
	PRIMARY KEY(`question_id`, `revision`)
);
--> statement-breakpoint
CREATE TABLE `content_revisions` (
	`target_id` text NOT NULL,
	`revision` integer NOT NULL,
	`body` text NOT NULL,
	`title` text,
	`tags` text,
	`created_at` text NOT NULL,
	`superseded_at` text NOT NULL,
	PRIMARY KEY(`target_id`, `revision`)
);
--> statement-breakpoint
ALTER TABLE `post_updates` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `post_updates` ADD `edited_at` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `edited_at` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `acceptance_revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `accepted_answer_revision` integer;