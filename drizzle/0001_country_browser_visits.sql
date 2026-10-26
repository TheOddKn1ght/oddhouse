CREATE TABLE `visit_pages` (
	`visit_id` text NOT NULL,
	`path` text NOT NULL,
	`last_counted` integer NOT NULL,
	PRIMARY KEY(`visit_id`, `path`),
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `visits` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`last_seen` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `visits_last_seen` ON `visits` (`last_seen`);--> statement-breakpoint
ALTER TABLE `hits` ADD `country` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `hits` ADD `browser` text DEFAULT '' NOT NULL;