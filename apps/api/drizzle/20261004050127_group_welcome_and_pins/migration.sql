CREATE TYPE "group_event_kind" AS ENUM('member_joined');--> statement-breakpoint
ALTER TYPE "email_preference_type" ADD VALUE 'group_pins_expired' BEFORE 'season_starting';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'group_pins_expired';--> statement-breakpoint
CREATE TABLE "group_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"group_id" uuid NOT NULL,
	"kind" "group_event_kind" NOT NULL,
	"actor_id" uuid,
	"invited_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_pins" (
	"group_id" uuid,
	"question_id" uuid,
	"pinned_by" uuid,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_pins_pkey" PRIMARY KEY("group_id","question_id")
);
--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN "welcome_dismissed_at" timestamp;--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN "invited_by_id" uuid;--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN "welcome_call_id" uuid;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "welcome_message" text;--> statement-breakpoint
CREATE INDEX "group_events_group_created_idx" ON "group_events" ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "group_pins_question_id_idx" ON "group_pins" ("question_id");--> statement-breakpoint
ALTER TABLE "group_events" ADD CONSTRAINT "group_events_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "group_events" ADD CONSTRAINT "group_events_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "group_events" ADD CONSTRAINT "group_events_invited_by_id_users_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_invited_by_id_users_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_welcome_call_id_calls_id_fkey" FOREIGN KEY ("welcome_call_id") REFERENCES "calls"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "group_pins" ADD CONSTRAINT "group_pins_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "group_pins" ADD CONSTRAINT "group_pins_question_id_questions_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "group_pins" ADD CONSTRAINT "group_pins_pinned_by_users_id_fkey" FOREIGN KEY ("pinned_by") REFERENCES "users"("id") ON DELETE SET NULL;