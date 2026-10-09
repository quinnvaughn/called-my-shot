CREATE TYPE "presser_app_template" AS ENUM('faded_and_lost', 'high_conviction_miss', 'redo_flip_lost', 'contrarian_hit', 'contrarian_miss', 'faders_wrong', 'streak_extended', 'perfect_game', 'oh_fer_game', 'game_summary');--> statement-breakpoint
CREATE TYPE "presser_question_source" AS ENUM('app', 'group', 'game_caller');--> statement-breakpoint
CREATE TYPE "presser_question_status" AS ENUM('pending', 'answered', 'withdrawn', 'removed');--> statement-breakpoint
CREATE TYPE "presser_report_reason" AS ENUM('harassment', 'hate', 'threat', 'sexual', 'personal_info', 'spam', 'other');--> statement-breakpoint
CREATE TYPE "presser_report_status" AS ENUM('open', 'dismissed', 'removed');--> statement-breakpoint
CREATE TYPE "presser_report_target" AS ENUM('question', 'answer', 'statement');--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'presser_question_received';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'presser_answered';--> statement-breakpoint
CREATE TABLE "presser_open_queue" (
	"user_id" uuid,
	"game_id" uuid,
	"dirtied_at" timestamp NOT NULL,
	CONSTRAINT "presser_open_queue_pkey" PRIMARY KEY("user_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "presser_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"presser_id" uuid NOT NULL,
	"source" "presser_question_source" NOT NULL,
	"asker_id" uuid,
	"app_template" "presser_app_template",
	"call_id" uuid,
	"app_key" text,
	"body" text NOT NULL,
	"answer_text" text,
	"no_comment" boolean DEFAULT false NOT NULL,
	"answered_at" timestamp,
	"status" "presser_question_status" DEFAULT 'pending'::"presser_question_status" NOT NULL,
	"sort_rank" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "presser_questions_presser_id_asker_id_unique" UNIQUE("presser_id","asker_id")
);
--> statement-breakpoint
CREATE TABLE "presser_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"reporter_id" uuid NOT NULL,
	"presser_id" uuid NOT NULL,
	"presser_question_id" uuid,
	"target" "presser_report_target" NOT NULL,
	"reason" "presser_report_reason" NOT NULL,
	"details" text,
	"status" "presser_report_status" DEFAULT 'open'::"presser_report_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by_admin_id" uuid,
	CONSTRAINT "presser_reports_reporter_id_presser_id_presser_question_id_target_unique" UNIQUE NULLS NOT DISTINCT("reporter_id","presser_id","presser_question_id","target")
);
--> statement-breakpoint
CREATE TABLE "pressers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"opened_at" timestamp NOT NULL,
	"closes_at" timestamp NOT NULL,
	"app_questions_generated_at" timestamp,
	"statement_text" text,
	"statement_posted_at" timestamp,
	"statement_removed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pressers_user_id_game_id_unique" UNIQUE("user_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_id" uuid,
	"blocked_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_pkey" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "presser_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "presser_questions_app_key_idx" ON "presser_questions" ("presser_id","app_key");--> statement-breakpoint
CREATE INDEX "presser_questions_presser_status_idx" ON "presser_questions" ("presser_id","status","sort_rank","created_at");--> statement-breakpoint
CREATE INDEX "presser_reports_status_idx" ON "presser_reports" ("status","created_at");--> statement-breakpoint
CREATE INDEX "pressers_game_id_idx" ON "pressers" ("game_id");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_id_idx" ON "user_blocks" ("blocked_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_presser_id_pressers_id_fkey" FOREIGN KEY ("presser_id") REFERENCES "pressers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "presser_open_queue" ADD CONSTRAINT "presser_open_queue_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "presser_open_queue" ADD CONSTRAINT "presser_open_queue_game_id_games_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "presser_questions" ADD CONSTRAINT "presser_questions_presser_id_pressers_id_fkey" FOREIGN KEY ("presser_id") REFERENCES "pressers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "presser_questions" ADD CONSTRAINT "presser_questions_asker_id_users_id_fkey" FOREIGN KEY ("asker_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "presser_questions" ADD CONSTRAINT "presser_questions_call_id_calls_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "presser_reports" ADD CONSTRAINT "presser_reports_reporter_id_users_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "presser_reports" ADD CONSTRAINT "presser_reports_presser_id_pressers_id_fkey" FOREIGN KEY ("presser_id") REFERENCES "pressers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "presser_reports" ADD CONSTRAINT "presser_reports_presser_question_id_presser_questions_id_fkey" FOREIGN KEY ("presser_question_id") REFERENCES "presser_questions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "presser_reports" ADD CONSTRAINT "presser_reports_reviewed_by_admin_id_users_id_fkey" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "pressers" ADD CONSTRAINT "pressers_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pressers" ADD CONSTRAINT "pressers_game_id_games_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE;