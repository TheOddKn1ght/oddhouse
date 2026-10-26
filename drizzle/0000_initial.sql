-- Adopt the original Oddhouse tables in place; new databases use the same baseline.
CREATE TABLE IF NOT EXISTS `admins` (
	`username` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hits` (
	`id` integer PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`kind` text NOT NULL,
	`path` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`referrer` text DEFAULT '' NOT NULL,
	`event` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "hits_kind_check" CHECK("hits"."kind" IN ('pageview', 'event'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hits_site_time` ON `hits` (`site_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`username`) REFERENCES `admins`(`username`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`origin` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `sites_origin_unique` ON `sites` (`origin`);