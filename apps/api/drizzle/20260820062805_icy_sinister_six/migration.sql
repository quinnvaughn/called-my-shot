CREATE TYPE "report_status" AS ENUM('open', 'dismissed');--> statement-breakpoint
CREATE TABLE "question_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"question_id" uuid NOT NULL,
	"reported_by_user_id" uuid NOT NULL,
	"reason" "void_reason" NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'open'::"report_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	CONSTRAINT "question_reports_question_id_reported_by_user_id_unique" UNIQUE("question_id","reported_by_user_id")
);
--> statement-breakpoint
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_question_id_questions_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_reported_by_user_id_users_id_fkey" FOREIGN KEY ("reported_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE;