CREATE TABLE "watch_quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"quiz_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"answers" jsonb DEFAULT '[]' NOT NULL,
	"open_served_at" timestamp,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"total_ms" integer DEFAULT 0 NOT NULL,
	"clean" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "watch_quiz_attempts_quiz_id_user_id_unique" UNIQUE("quiz_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "watch_quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"league_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"opponent_team_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"code" text NOT NULL,
	"game_starts_at" timestamp NOT NULL,
	"questions" jsonb NOT NULL,
	"box_score_synced_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "watch_quizzes_team_id_game_id_unique" UNIQUE("team_id","game_id"),
	CONSTRAINT "watch_quizzes_team_id_code_unique" UNIQUE("team_id","code")
);
--> statement-breakpoint
CREATE INDEX "watch_quiz_attempts_board_idx" ON "watch_quiz_attempts" ("quiz_id","correct_count" DESC NULLS LAST,"total_ms");--> statement-breakpoint
CREATE INDEX "watch_quiz_attempts_user_idx" ON "watch_quiz_attempts" ("user_id");--> statement-breakpoint
CREATE INDEX "watch_quizzes_team_starts_idx" ON "watch_quizzes" ("team_id","game_starts_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "watch_quiz_attempts" ADD CONSTRAINT "watch_quiz_attempts_quiz_id_watch_quizzes_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "watch_quizzes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "watch_quiz_attempts" ADD CONSTRAINT "watch_quiz_attempts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "watch_quizzes" ADD CONSTRAINT "watch_quizzes_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "watch_quizzes" ADD CONSTRAINT "watch_quizzes_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "watch_quizzes" ADD CONSTRAINT "watch_quizzes_opponent_team_id_teams_id_fkey" FOREIGN KEY ("opponent_team_id") REFERENCES "teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "watch_quizzes" ADD CONSTRAINT "watch_quizzes_game_id_games_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE;