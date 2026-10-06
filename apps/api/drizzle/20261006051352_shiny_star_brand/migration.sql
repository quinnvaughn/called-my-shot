CREATE TABLE "ballot_tiebreaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"ballot_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ballot_tiebreaks_ballot_id_user_id_question_id_unique" UNIQUE("ballot_id","user_id","question_id")
);
--> statement-breakpoint
ALTER TABLE "ballot_tiebreaks" ADD CONSTRAINT "ballot_tiebreaks_ballot_id_ballots_id_fkey" FOREIGN KEY ("ballot_id") REFERENCES "ballots"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ballot_tiebreaks" ADD CONSTRAINT "ballot_tiebreaks_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ballot_tiebreaks" ADD CONSTRAINT "ballot_tiebreaks_question_id_questions_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE;