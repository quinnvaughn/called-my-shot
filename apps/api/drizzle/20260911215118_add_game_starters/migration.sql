CREATE TYPE "game_starter_role" AS ENUM('starting_pitcher', 'batter', 'offense', 'defense', 'starter');--> statement-breakpoint
CREATE TABLE "game_starters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"game_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"player_id" uuid,
	"role" "game_starter_role" NOT NULL,
	"sort_order" integer NOT NULL,
	"player_name" text NOT NULL,
	"position" text,
	"stat_line" text,
	"injury_status" text,
	CONSTRAINT "game_starters_game_id_team_id_role_sort_order_unique" UNIQUE("game_id","team_id","role","sort_order")
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "starters_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "game_starters" ADD CONSTRAINT "game_starters_game_id_games_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "game_starters" ADD CONSTRAINT "game_starters_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "game_starters" ADD CONSTRAINT "game_starters_player_id_players_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL;