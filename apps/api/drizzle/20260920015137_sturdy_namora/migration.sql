CREATE TYPE "team_game_stat_scope" AS ENUM('team_box', 'player_table_total');--> statement-breakpoint
CREATE TABLE "player_game_stats" (
	"game_id" uuid,
	"source" "sync_source" NOT NULL,
	"team_id" uuid NOT NULL,
	"opponent_team_id" uuid NOT NULL,
	"is_home" boolean NOT NULL,
	"game_date" timestamp NOT NULL,
	"season_id" uuid NOT NULL,
	"league_id" uuid NOT NULL,
	"stat_key" text,
	"value_text" text NOT NULL,
	"value_numeric" numeric(10,3),
	"source_athlete_id" text,
	"player_id" uuid,
	"did_not_play" boolean NOT NULL,
	CONSTRAINT "player_game_stats_pkey" PRIMARY KEY("game_id","source_athlete_id","stat_key")
);
--> statement-breakpoint
CREATE TABLE "team_game_stats" (
	"game_id" uuid,
	"source" "sync_source" NOT NULL,
	"team_id" uuid,
	"opponent_team_id" uuid NOT NULL,
	"is_home" boolean NOT NULL,
	"game_date" timestamp NOT NULL,
	"season_id" uuid NOT NULL,
	"league_id" uuid NOT NULL,
	"stat_key" text,
	"value_text" text NOT NULL,
	"value_numeric" numeric(10,3),
	"scope" "team_game_stat_scope",
	CONSTRAINT "team_game_stats_pkey" PRIMARY KEY("game_id","team_id","scope","stat_key")
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "box_score_synced_at" timestamp;--> statement-breakpoint
CREATE INDEX "player_game_stats_player_stat_date_idx" ON "player_game_stats" ("player_id","stat_key","game_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "player_game_stats_opponent_stat_date_idx" ON "player_game_stats" ("opponent_team_id","stat_key","game_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "player_game_stats_team_stat_date_idx" ON "player_game_stats" ("team_id","stat_key","game_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "team_game_stats_team_scope_stat_date_idx" ON "team_game_stats" ("team_id","scope","stat_key","game_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "team_game_stats_opponent_scope_stat_date_idx" ON "team_game_stats" ("opponent_team_id","scope","stat_key","game_date" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_game_id_games_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_opponent_team_id_teams_id_fkey" FOREIGN KEY ("opponent_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_season_id_seasons_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_player_id_players_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "team_game_stats" ADD CONSTRAINT "team_game_stats_game_id_games_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "team_game_stats" ADD CONSTRAINT "team_game_stats_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "team_game_stats" ADD CONSTRAINT "team_game_stats_opponent_team_id_teams_id_fkey" FOREIGN KEY ("opponent_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "team_game_stats" ADD CONSTRAINT "team_game_stats_season_id_seasons_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "team_game_stats" ADD CONSTRAINT "team_game_stats_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;