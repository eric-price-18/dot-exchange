CREATE TABLE `analytics_daily` (
	`day` text NOT NULL,
	`metric` text NOT NULL,
	`channel` text NOT NULL,
	`operation` text NOT NULL,
	`outcome` text NOT NULL,
	`traffic_class` text NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`day`, `metric`, `channel`, `operation`, `outcome`, `traffic_class`)
);
