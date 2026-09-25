CREATE TABLE "postseason_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"league_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"round" text NOT NULL,
	"team_a_id" uuid NOT NULL,
	"team_b_id" uuid NOT NULL,
	"best_of" integer,
	"winner_team_id" uuid,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "postseason_series_season_id_round_team_a_id_team_b_id_unique" UNIQUE("season_id","round","team_a_id","team_b_id")
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "postseason_round" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "series_game_number" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "if_necessary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "start_time_tbd" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "series_id" uuid;--> statement-breakpoint
CREATE INDEX "games_series_id_idx" ON "games" ("series_id");--> statement-breakpoint
CREATE INDEX "questions_series_id_idx" ON "questions" ("series_id");--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_series_id_postseason_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "postseason_series"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "postseason_series" ADD CONSTRAINT "postseason_series_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "postseason_series" ADD CONSTRAINT "postseason_series_season_id_seasons_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "postseason_series" ADD CONSTRAINT "postseason_series_team_a_id_teams_id_fkey" FOREIGN KEY ("team_a_id") REFERENCES "teams"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "postseason_series" ADD CONSTRAINT "postseason_series_team_b_id_teams_id_fkey" FOREIGN KEY ("team_b_id") REFERENCES "teams"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "postseason_series" ADD CONSTRAINT "postseason_series_winner_team_id_teams_id_fkey" FOREIGN KEY ("winner_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_series_id_postseason_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "postseason_series"("id") ON DELETE SET NULL;