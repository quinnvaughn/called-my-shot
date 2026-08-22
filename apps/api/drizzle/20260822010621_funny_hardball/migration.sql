CREATE TYPE "question_shape" AS ENUM('player_stat_over_under', 'team_stat_over_under', 'game_total_over_under', 'player_stat_numeric_guess', 'team_stat_numeric_guess', 'player_vs_player', 'team_vs_team', 'yes_no_prop', 'player_season_award', 'team_season_award', 'player_award_finalists');--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "shape" "question_shape" NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "event_clause" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "award_name" text;--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "category";--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "numeric_subject_type";--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "options_open_field";--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "open_field_kind";--> statement-breakpoint
DROP TYPE "numeric_subject_type";--> statement-breakpoint
DROP TYPE "question_category";--> statement-breakpoint
DROP TYPE "question_type";