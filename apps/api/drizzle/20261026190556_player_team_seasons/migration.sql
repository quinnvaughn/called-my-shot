CREATE TABLE "player_team_seasons" (
	"player_id" uuid,
	"team_id" uuid,
	"season" integer,
	CONSTRAINT "player_team_seasons_pkey" PRIMARY KEY("player_id","team_id","season")
);
--> statement-breakpoint
CREATE INDEX "player_team_seasons_team_season_idx" ON "player_team_seasons" ("team_id","season");--> statement-breakpoint
ALTER TABLE "player_team_seasons" ADD CONSTRAINT "player_team_seasons_player_id_players_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "player_team_seasons" ADD CONSTRAINT "player_team_seasons_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;