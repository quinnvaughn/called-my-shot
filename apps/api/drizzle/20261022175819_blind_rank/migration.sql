CREATE TYPE "rank_puzzle_kind" AS ENUM('season_stat', 'career_stat', 'team_season', 'franchise');--> statement-breakpoint
CREATE TABLE "player_careers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"league_id" uuid NOT NULL,
	"espn_athlete_id" text NOT NULL,
	"athlete" text NOT NULL,
	"team_id" uuid,
	"stats" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "player_careers_league_id_espn_athlete_id_unique" UNIQUE("league_id","espn_athlete_id")
);
--> statement-breakpoint
CREATE TABLE "player_season_leaders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"league_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"category" text NOT NULL,
	"rank" integer NOT NULL,
	"espn_athlete_id" text NOT NULL,
	"athlete" text NOT NULL,
	"team_id" uuid,
	"team_name" text,
	"value" double precision NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "player_season_leaders_league_id_year_category_espn_athlete_id_unique" UNIQUE("league_id","year","category","espn_athlete_id")
);
--> statement-breakpoint
CREATE TABLE "rank_puzzle_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"puzzle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"placements" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rank_puzzle_results_puzzle_id_user_id_unique" UNIQUE("puzzle_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "rank_puzzles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"league_id" uuid NOT NULL,
	"kind" "rank_puzzle_kind" NOT NULL,
	"prompt" text NOT NULL,
	"context" text NOT NULL,
	"items" jsonb NOT NULL,
	"signature" text NOT NULL UNIQUE,
	"play_date" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "player_season_leaders_athlete_idx" ON "player_season_leaders" ("league_id","espn_athlete_id");--> statement-breakpoint
CREATE INDEX "rank_puzzle_results_user_idx" ON "rank_puzzle_results" ("user_id");--> statement-breakpoint
ALTER TABLE "player_careers" ADD CONSTRAINT "player_careers_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "player_careers" ADD CONSTRAINT "player_careers_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "player_season_leaders" ADD CONSTRAINT "player_season_leaders_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "player_season_leaders" ADD CONSTRAINT "player_season_leaders_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "rank_puzzle_results" ADD CONSTRAINT "rank_puzzle_results_puzzle_id_rank_puzzles_id_fkey" FOREIGN KEY ("puzzle_id") REFERENCES "rank_puzzles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "rank_puzzle_results" ADD CONSTRAINT "rank_puzzle_results_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "rank_puzzles" ADD CONSTRAINT "rank_puzzles_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;