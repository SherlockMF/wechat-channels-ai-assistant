CREATE TABLE `app_state_items` (
	`collection` text NOT NULL,
	`id` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`collection`, `id`)
);
