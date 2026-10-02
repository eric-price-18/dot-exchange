ALTER TABLE `acceptance_history` ADD `answer_content_version` integer;--> statement-breakpoint
ALTER TABLE `posts` ADD `content_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `accepted_answer_content_version` integer;