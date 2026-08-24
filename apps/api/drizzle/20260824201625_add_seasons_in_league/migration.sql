ALTER TABLE "questions" ADD COLUMN "award_seasons_in_league" integer[];--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "seasons_in_league" integer DEFAULT 0 NOT NULL;