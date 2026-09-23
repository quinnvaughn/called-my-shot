CREATE TABLE "team_season_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"team_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"as_of" timestamp NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"points_for" integer DEFAULT 0 NOT NULL,
	"points_against" integer DEFAULT 0 NOT NULL,
	"point_differential" integer DEFAULT 0 NOT NULL,
	"home_wins" integer DEFAULT 0 NOT NULL,
	"home_losses" integer DEFAULT 0 NOT NULL,
	"home_ties" integer DEFAULT 0 NOT NULL,
	"road_wins" integer DEFAULT 0 NOT NULL,
	"road_losses" integer DEFAULT 0 NOT NULL,
	"road_ties" integer DEFAULT 0 NOT NULL,
	"streak" text,
	"last_ten" text,
	"possessions" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_season_stats_team_id_season_id_as_of_unique" UNIQUE("team_id","season_id","as_of")
);
--> statement-breakpoint
CREATE INDEX "team_season_stats_team_as_of_idx" ON "team_season_stats" ("team_id","as_of" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "team_season_stats" ADD CONSTRAINT "team_season_stats_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "team_season_stats" ADD CONSTRAINT "team_season_stats_season_id_seasons_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE;