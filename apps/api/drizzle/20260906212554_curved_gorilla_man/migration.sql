CREATE TYPE "email_preference_type" AS ENUM('all', 'call_resolved', 'dispute_filed', 'dispute_upheld', 'dispute_overturned', 'question_voided', 'group_member_joined', 'question_shared_to_group');--> statement-breakpoint
CREATE TABLE "email_opt_outs" (
	"user_id" uuid,
	"type" "email_preference_type",
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_opt_outs_pkey" PRIMARY KEY("user_id","type")
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"type" "email_preference_type" NOT NULL,
	"question_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"sent_at" timestamp,
	"skipped_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "email_outbox_unsent_call_idx" ON "email_outbox" ("call_id") WHERE sent_at is null;--> statement-breakpoint
CREATE INDEX "email_outbox_pending_idx" ON "email_outbox" ("user_id","created_at") WHERE sent_at is null;--> statement-breakpoint
ALTER TABLE "email_opt_outs" ADD CONSTRAINT "email_opt_outs_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_question_id_questions_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_call_id_calls_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE;