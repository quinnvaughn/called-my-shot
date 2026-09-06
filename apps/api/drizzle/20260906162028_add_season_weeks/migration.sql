CREATE TABLE "season_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"season_id" uuid NOT NULL,
	"season_type" "game_season_type" NOT NULL,
	"week_number" integer NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	CONSTRAINT "season_weeks_season_id_season_type_week_number_unique" UNIQUE("season_id","season_type","week_number")
);
--> statement-breakpoint
ALTER TABLE "season_weeks" ADD CONSTRAINT "season_weeks_season_id_seasons_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE;