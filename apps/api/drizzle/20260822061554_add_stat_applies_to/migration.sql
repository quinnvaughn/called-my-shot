CREATE TYPE "stat_applies_to" AS ENUM('player', 'team', 'both');--> statement-breakpoint
ALTER TABLE "stats" ADD COLUMN "applies_to" "stat_applies_to" DEFAULT 'both'::"stat_applies_to" NOT NULL;