CREATE TYPE "void_reason" AS ENUM('nonsensical', 'off_topic', 'unsupported_sport', 'duplicate', 'other');--> statement-breakpoint
CREATE TYPE "game_status" AS ENUM('scheduled', 'live', 'final');--> statement-breakpoint
CREATE TYPE "league_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "question_voids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"question_id" uuid NOT NULL,
	"question_title" text NOT NULL,
	"target_user_id" uuid NOT NULL,
	"voided_by_admin_id" uuid,
	"reason" "void_reason" NOT NULL,
	"duplicate_of_question_id" uuid,
	"note" text,
	"counts_as_strike" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "status" "game_status" DEFAULT 'scheduled'::"game_status" NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "home_score" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "away_score" integer;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "status" "league_status" DEFAULT 'active'::"league_status" NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_verified_pundit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "strike_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "question_creation_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "question_voids" ADD CONSTRAINT "question_voids_target_user_id_users_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "question_voids" ADD CONSTRAINT "question_voids_voided_by_admin_id_users_id_fkey" FOREIGN KEY ("voided_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "question_voids" ADD CONSTRAINT "question_voids_duplicate_of_question_id_questions_id_fkey" FOREIGN KEY ("duplicate_of_question_id") REFERENCES "questions"("id") ON DELETE SET NULL;