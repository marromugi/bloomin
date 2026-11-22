CREATE TABLE `bingo_items` (
	`bingo_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`item_id` text NOT NULL,
	`title` text NOT NULL,
	`emoji` text NOT NULL,
	PRIMARY KEY(`bingo_id`, `ordinal`),
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bingos` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`achieved_at` integer NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bingos_id_card` ON `bingos` (`id`,`card_id`);--> statement-breakpoint
CREATE TABLE `card_members` (
	`card_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`card_id`, `participant_id`),
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `card_members_by_participant` ON `card_members` (`participant_id`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`size` integer NOT NULL,
	`deadline_date` text NOT NULL,
	`deadline_time_zone` text NOT NULL,
	`join_code` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cards_size" CHECK(typeof("cards"."size") = 'integer' AND "cards"."size" BETWEEN 3 AND 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cards_join_code_unique` ON `cards` (`join_code`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`emoji` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "items_position" CHECK(typeof("items"."position") = 'integer' AND "items"."position" BETWEEN 0 AND 24)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_cell` ON `items` (`card_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `items_id_card` ON `items` (`id`,`card_id`);--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`public_key` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "participants_public_key_length" CHECK(length("participants"."public_key") = 44)
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`bingo_id` text NOT NULL,
	`taken_by` text NOT NULL,
	`taken_at` integer NOT NULL,
	`uploaded_at` integer NOT NULL,
	`content_type` text NOT NULL,
	`object_key` text NOT NULL,
	FOREIGN KEY (`taken_by`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bingo_id`,`card_id`) REFERENCES `bingos`(`id`,`card_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "photos_content_type" CHECK("photos"."content_type" IN ('image/jpeg', 'image/heic'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photos_object_key_unique` ON `photos` (`object_key`);--> statement-breakpoint
CREATE INDEX `photos_by_bingo` ON `photos` (`bingo_id`);--> statement-breakpoint
CREATE TABLE `stamps` (
	`item_id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`stamped_by` text NOT NULL,
	`comment` text NOT NULL,
	`stamped_at` integer NOT NULL,
	FOREIGN KEY (`stamped_by`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`,`card_id`) REFERENCES `items`(`id`,`card_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stamps_by_card` ON `stamps` (`card_id`);--> statement-breakpoint
CREATE TABLE `used_signatures` (
	`signature` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `used_signatures_by_expiry` ON `used_signatures` (`expires_at`);