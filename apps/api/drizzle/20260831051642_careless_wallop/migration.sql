CREATE TYPE "game_season_type" AS ENUM('regular', 'postseason');--> statement-breakpoint
CREATE TYPE "league_window_type" AS ENUM('date', 'week');--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "season_type" "game_season_type" DEFAULT 'regular'::"game_season_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "week_number" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "slot" text;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "window_type" "league_window_type" DEFAULT 'date'::"league_window_type" NOT NULL;