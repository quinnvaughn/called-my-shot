ALTER TYPE "team_game_stat_scope" ADD VALUE 'period';--> statement-breakpoint
ALTER TABLE "player_game_stats" ADD COLUMN "starter" boolean;