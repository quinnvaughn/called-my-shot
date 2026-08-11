CREATE TABLE "leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"sport_id" uuid NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text NOT NULL,
	"slug" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"current_team_id" uuid,
	"name" text NOT NULL,
	"position" text
);
--> statement-breakpoint
CREATE TABLE "sports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL UNIQUE,
	"slug" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"sport_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "stats_sport_id_name_unique" UNIQUE("sport_id","name")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"league_id" uuid NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text NOT NULL,
	"color" text NOT NULL,
	CONSTRAINT "teams_league_id_abbreviation_unique" UNIQUE("league_id","abbreviation")
);
--> statement-breakpoint
ALTER TABLE "question_options" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "question_options" ADD COLUMN "player_id" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "sport_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "league_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "resolution_source_url" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "stat_id" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "subject_team_id" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "subject_player_id" uuid;--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "other_source_url";--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "ou_stat";--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "numeric_stat";--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "numeric_subject_name";--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "resolution_source" SET DATA TYPE text USING "resolution_source"::text;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_player_id_players_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_sport_id_sports_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_stat_id_stats_id_fkey" FOREIGN KEY ("stat_id") REFERENCES "stats"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_subject_team_id_teams_id_fkey" FOREIGN KEY ("subject_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_subject_player_id_players_id_fkey" FOREIGN KEY ("subject_player_id") REFERENCES "players"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_sport_id_sports_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_current_team_id_teams_id_fkey" FOREIGN KEY ("current_team_id") REFERENCES "teams"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "stats" ADD CONSTRAINT "stats_sport_id_sports_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
DROP TYPE "resolution_source";