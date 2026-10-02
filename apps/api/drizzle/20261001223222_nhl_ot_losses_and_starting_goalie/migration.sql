ALTER TYPE "game_starter_role" ADD VALUE 'starting_goalie';--> statement-breakpoint
ALTER TABLE "team_records" ADD COLUMN "ot_losses" integer;--> statement-breakpoint
ALTER TABLE "team_season_stats" ADD COLUMN "home_ot_losses" integer;--> statement-breakpoint
ALTER TABLE "team_season_stats" ADD COLUMN "road_ot_losses" integer;