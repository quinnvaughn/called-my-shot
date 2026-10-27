CREATE TABLE "teammate_chain_puzzles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"league_id" uuid NOT NULL,
	"start_player_id" uuid NOT NULL,
	"target_player_id" uuid NOT NULL,
	"par" integer NOT NULL,
	"par_route" uuid[] NOT NULL,
	"signature" text NOT NULL UNIQUE,
	"play_date" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teammate_chain_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"puzzle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"moves" jsonb DEFAULT '[]' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"solved" boolean DEFAULT false NOT NULL,
	"route" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teammate_chain_results_puzzle_id_user_id_unique" UNIQUE("puzzle_id","user_id")
);
--> statement-breakpoint
CREATE INDEX "teammate_chain_results_user_idx" ON "teammate_chain_results" ("user_id");--> statement-breakpoint
ALTER TABLE "teammate_chain_puzzles" ADD CONSTRAINT "teammate_chain_puzzles_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "teammate_chain_puzzles" ADD CONSTRAINT "teammate_chain_puzzles_start_player_id_players_id_fkey" FOREIGN KEY ("start_player_id") REFERENCES "players"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "teammate_chain_puzzles" ADD CONSTRAINT "teammate_chain_puzzles_target_player_id_players_id_fkey" FOREIGN KEY ("target_player_id") REFERENCES "players"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "teammate_chain_results" ADD CONSTRAINT "teammate_chain_results_puzzle_id_teammate_chain_puzzles_id_fkey" FOREIGN KEY ("puzzle_id") REFERENCES "teammate_chain_puzzles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "teammate_chain_results" ADD CONSTRAINT "teammate_chain_results_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;