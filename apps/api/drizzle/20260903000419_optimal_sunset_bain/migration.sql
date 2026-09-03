CREATE TYPE "award_verb" AS ENUM('win', 'be');--> statement-breakpoint
ALTER TYPE "question_shape" ADD VALUE 'team_season_stat_numeric_guess';--> statement-breakpoint
ALTER TYPE "question_shape" ADD VALUE 'player_game_stat_leader';--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "award_verb" "award_verb";