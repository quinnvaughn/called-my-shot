CREATE TYPE "streak_family" AS ENUM('winners', 'totals', 'props', 'numeric');--> statement-breakpoint
ALTER TYPE "email_preference_type" ADD VALUE 'sweep_completed' BEFORE 'season_starting';--> statement-breakpoint
ALTER TYPE "email_preference_type" ADD VALUE 'streak_milestone' BEFORE 'season_starting';--> statement-breakpoint
ALTER TYPE "email_preference_type" ADD VALUE 'streak_personal_best' BEFORE 'season_starting';--> statement-breakpoint
ALTER TYPE "email_preference_type" ADD VALUE 'streak_snapped' BEFORE 'season_starting';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'sweep_completed';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'streak_milestone';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'streak_personal_best';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'streak_snapped';--> statement-breakpoint
CREATE TABLE "achievement_notices" (
	"user_id" uuid,
	"dedupe_key" text,
	"notification_id" uuid,
	"emailed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "achievement_notices_pkey" PRIMARY KEY("user_id","dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "call_streak_positions" (
	"call_id" uuid PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"league_id" uuid NOT NULL,
	"family" "streak_family" NOT NULL,
	"length" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streak_recompute_queue" (
	"user_id" uuid,
	"league_id" uuid,
	"family" "streak_family",
	"dirtied_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "streak_recompute_queue_pkey" PRIMARY KEY("user_id","league_id","family")
);
--> statement-breakpoint
CREATE TABLE "sweep_recompute_queue" (
	"league_id" uuid,
	"slate_key" text,
	"dirtied_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sweep_recompute_queue_pkey" PRIMARY KEY("league_id","slate_key")
);
--> statement-breakpoint
CREATE TABLE "user_streaks" (
	"user_id" uuid,
	"league_id" uuid,
	"family" "streak_family",
	"current_length" integer DEFAULT 0 NOT NULL,
	"current_start_call_id" uuid,
	"current_end_call_id" uuid,
	"best_length" integer DEFAULT 0 NOT NULL,
	"best_start_call_id" uuid,
	"best_end_call_id" uuid,
	"best_ended_at" timestamp,
	"last_settled_at" timestamp,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_streaks_pkey" PRIMARY KEY("user_id","league_id","family")
);
--> statement-breakpoint
CREATE TABLE "user_sweeps" (
	"user_id" uuid,
	"league_id" uuid,
	"slate_key" text,
	"season_id" uuid NOT NULL,
	"game_count" integer NOT NULL,
	"first_starts_at" timestamp NOT NULL,
	"settled_at" timestamp NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_sweeps_pkey" PRIMARY KEY("user_id","league_id","slate_key")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "league_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "streak_family" "streak_family";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "slate_key" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "achievement_label" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "achievement_count" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "previous_best" integer;--> statement-breakpoint
CREATE INDEX "questions_game_id_idx" ON "questions" ("game_id");--> statement-breakpoint
CREATE INDEX "call_streak_positions_track_idx" ON "call_streak_positions" ("user_id","league_id","family");--> statement-breakpoint
CREATE INDEX "user_sweeps_user_settled_idx" ON "user_sweeps" ("user_id","settled_at");--> statement-breakpoint
ALTER TABLE "achievement_notices" ADD CONSTRAINT "achievement_notices_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "achievement_notices" ADD CONSTRAINT "achievement_notices_notification_id_notifications_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "call_streak_positions" ADD CONSTRAINT "call_streak_positions_call_id_calls_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "call_streak_positions" ADD CONSTRAINT "call_streak_positions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "call_streak_positions" ADD CONSTRAINT "call_streak_positions_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "streak_recompute_queue" ADD CONSTRAINT "streak_recompute_queue_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "streak_recompute_queue" ADD CONSTRAINT "streak_recompute_queue_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sweep_recompute_queue" ADD CONSTRAINT "sweep_recompute_queue_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_current_start_call_id_calls_id_fkey" FOREIGN KEY ("current_start_call_id") REFERENCES "calls"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_current_end_call_id_calls_id_fkey" FOREIGN KEY ("current_end_call_id") REFERENCES "calls"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_best_start_call_id_calls_id_fkey" FOREIGN KEY ("best_start_call_id") REFERENCES "calls"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_best_end_call_id_calls_id_fkey" FOREIGN KEY ("best_end_call_id") REFERENCES "calls"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "user_sweeps" ADD CONSTRAINT "user_sweeps_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_sweeps" ADD CONSTRAINT "user_sweeps_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_sweeps" ADD CONSTRAINT "user_sweeps_season_id_seasons_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE;