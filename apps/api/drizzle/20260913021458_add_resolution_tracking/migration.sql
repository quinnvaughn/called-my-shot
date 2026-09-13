CREATE TYPE "call_unscored_reason" AS ENUM('question_voided', 'creator_sole_caller');--> statement-breakpoint
CREATE TYPE "resolution_method" AS ENUM('system', 'creator', 'admin');--> statement-breakpoint
CREATE TYPE "resolution_mode" AS ENUM('system', 'manual');--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "unscored_reason" "call_unscored_reason";--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "finalized_at" timestamp;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "resolution_method" "resolution_method";--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "resolved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "resolution_mode" "resolution_mode" DEFAULT 'manual'::"resolution_mode" NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_resolved_by_user_id_users_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;