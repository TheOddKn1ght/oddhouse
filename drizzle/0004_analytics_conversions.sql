CREATE TABLE `funnels` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`steps` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `funnels_site` ON `funnels` (`site_id`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "goals_kind_check" CHECK("goals"."kind" IN ('path', 'event'))
);
--> statement-breakpoint
CREATE INDEX `goals_site` ON `goals` (`site_id`);--> statement-breakpoint
ALTER TABLE `hits` ADD `journey_id` text;--> statement-breakpoint
CREATE INDEX `hits_journey` ON `hits` (`journey_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `journeys` ADD `pageviews` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `journeys` ADD `events` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `page_activity` ADD `journey_id` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `retention_days` integer;