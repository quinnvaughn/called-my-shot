CREATE TABLE "question_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"group_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"shared_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "question_shares_group_id_question_id_unique" UNIQUE("group_id","question_id")
);
--> statement-breakpoint
ALTER TABLE "question_shares" ADD CONSTRAINT "question_shares_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "question_shares" ADD CONSTRAINT "question_shares_question_id_questions_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "question_shares" ADD CONSTRAINT "question_shares_shared_by_users_id_fkey" FOREIGN KEY ("shared_by") REFERENCES "users"("id") ON DELETE CASCADE;