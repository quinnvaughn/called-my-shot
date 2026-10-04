CREATE TABLE "question_live_readings" (
	"question_id" uuid PRIMARY KEY,
	"value" numeric(8,3),
	"option_values" jsonb,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "question_live_readings" ADD CONSTRAINT "question_live_readings_question_id_questions_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE;