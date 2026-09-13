CREATE TYPE "auto_resolve_failure" AS ENUM('fetch_failed', 'box_score_not_final', 'missing_external_ref', 'subject_not_in_box_score', 'stat_undefined', 'tie', 'push', 'leader_not_in_pool', 'no_leader', 'unmapped', 'recheck_disagreed');--> statement-breakpoint
CREATE TABLE "question_auto_resolutions" (
	"question_id" uuid PRIMARY KEY,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"next_attempt_at" timestamp,
	"failure_reason" "auto_resolve_failure",
	"failure_detail" text,
	"escalated_at" timestamp,
	"settled_at" timestamp,
	"recheck_due_at" timestamp,
	"rechecked_at" timestamp,
	"evidence" jsonb
);
--> statement-breakpoint
ALTER TABLE "question_auto_resolutions" ADD CONSTRAINT "question_auto_resolutions_question_id_questions_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE;