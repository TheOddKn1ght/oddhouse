CREATE TABLE `journeys` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`entry_path` text NOT NULL,
	`exit_path` text NOT NULL,
	`utm_source` text DEFAULT '' NOT NULL,
	`utm_medium` text DEFAULT '' NOT NULL,
	`utm_campaign` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `journeys_site_start` ON `journeys` (`site_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `journeys_site_seen` ON `journeys` (`site_id`,`last_seen`);--> statement-breakpoint
CREATE TABLE `page_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`path` text NOT NULL,
	`active_ms` integer DEFAULT 0 NOT NULL,
	`max_scroll` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_site_time` ON `page_activity` (`site_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `hits` ADD `utm_source` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `hits` ADD `utm_medium` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `hits` ADD `utm_campaign` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `hits` ADD `target` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `visits` ADD `journey_id` text;