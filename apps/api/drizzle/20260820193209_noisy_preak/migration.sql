CREATE TYPE "notification_type" AS ENUM('call_resolved', 'dispute_filed', 'dispute_upheld', 'dispute_overturned', 'question_voided', 'group_member_joined', 'question_shared_to_group');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"actor_id" uuid,
	"question_id" uuid,
	"group_id" uuid,
	"dispute_id" uuid,
	"question_title" text,
	"group_name" text,
	"actor_username" text,
	"points_delta" integer,
	"strike_count" integer,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notifications_user_read_created_idx" ON "notifications" ("user_id","read_at","created_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_question_id_questions_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_dispute_id_resolution_disputes_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "resolution_disputes"("id") ON DELETE SET NULL;