CREATE TYPE "dispute_status" AS ENUM('open', 'upheld', 'overturned');--> statement-breakpoint
ALTER TYPE "question_status" ADD VALUE 'disputed';--> statement-breakpoint
CREATE TABLE "resolution_disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"question_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "dispute_status" DEFAULT 'open'::"dispute_status" NOT NULL,
	"resolution_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	CONSTRAINT "resolution_disputes_question_id_user_id_unique" UNIQUE("question_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "resolution_disputes" ADD CONSTRAINT "resolution_disputes_question_id_questions_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "resolution_disputes" ADD CONSTRAINT "resolution_disputes_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;