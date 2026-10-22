CREATE TYPE "team_season_outcome" AS ENUM('champion', 'finalist', 'lost_semifinal', 'lost_round', 'missed');--> statement-breakpoint
CREATE TABLE "season_puzzle_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"puzzle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"guesses" jsonb DEFAULT '[]' NOT NULL,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "season_puzzle_results_puzzle_id_user_id_unique" UNIQUE("puzzle_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "season_puzzles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"team_season_id" uuid NOT NULL,
	"clues" text[] NOT NULL,
	"play_date" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"league_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"label" text NOT NULL,
	"name" text NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"ties" integer DEFAULT 0 NOT NULL,
	"ot_losses" integer DEFAULT 0 NOT NULL,
	"points_for" integer NOT NULL,
	"points_against" integer NOT NULL,
	"conference" text,
	"division" text,
	"division_rank" integer,
	"outcome" "team_season_outcome" NOT NULL,
	"rounds_from_final" integer,
	"leaders" jsonb NOT NULL,
	"puzzle_ready" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_seasons_team_id_year_unique" UNIQUE("team_id","year")
);
--> statement-breakpoint
CREATE INDEX "season_puzzle_results_user_idx" ON "season_puzzle_results" ("user_id");--> statement-breakpoint
CREATE INDEX "team_seasons_league_idx" ON "team_seasons" ("league_id");--> statement-breakpoint
ALTER TABLE "season_puzzle_results" ADD CONSTRAINT "season_puzzle_results_puzzle_id_season_puzzles_id_fkey" FOREIGN KEY ("puzzle_id") REFERENCES "season_puzzles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "season_puzzle_results" ADD CONSTRAINT "season_puzzle_results_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "season_puzzles" ADD CONSTRAINT "season_puzzles_team_season_id_team_seasons_id_fkey" FOREIGN KEY ("team_season_id") REFERENCES "team_seasons"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "team_seasons" ADD CONSTRAINT "team_seasons_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "team_seasons" ADD CONSTRAINT "team_seasons_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;