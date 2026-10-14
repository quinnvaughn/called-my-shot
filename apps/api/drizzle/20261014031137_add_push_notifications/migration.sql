CREATE TYPE "push_preference_type" AS ENUM('all', 'call_resolved', 'dispute_filed', 'dispute_upheld', 'dispute_overturned', 'question_voided', 'call_voided', 'group_member_joined', 'question_shared_to_group', 'sweep_completed', 'streak_milestone', 'streak_personal_best', 'streak_snapped', 'game_reminder', 'redo_earned', 'call_faded', 'fade_gloated', 'group_pins_expired', 'game_resolved', 'presser_question_received', 'presser_answered', 'challenge_accepted', 'challenge_settled', 'challenge_gloated', 'challenge_posted_to_group');--> statement-breakpoint
CREATE TABLE "push_opt_outs" (
	"user_id" uuid,
	"type" "push_preference_type",
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_opt_outs_pkey" PRIMARY KEY("user_id","type")
);
--> statement-breakpoint
CREATE TABLE "push_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"notification_id" uuid NOT NULL,
	"collapse_key" text NOT NULL,
	"send_after" timestamp NOT NULL,
	"sent_at" timestamp,
	"skipped_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"title" text,
	"body" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"endpoint" text NOT NULL UNIQUE,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"platform" text NOT NULL,
	"standalone" boolean DEFAULT false NOT NULL,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_success_at" timestamp,
	"last_failure_at" timestamp,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "push_outbox_unsent_key_idx" ON "push_outbox" ("user_id","collapse_key") WHERE sent_at is null;--> statement-breakpoint
CREATE INDEX "push_outbox_pending_idx" ON "push_outbox" ("send_after") WHERE sent_at is null;--> statement-breakpoint
CREATE INDEX "push_outbox_sent_key_idx" ON "push_outbox" ("user_id","collapse_key","sent_at");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" ("user_id");--> statement-breakpoint
ALTER TABLE "push_opt_outs" ADD CONSTRAINT "push_opt_outs_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "push_outbox" ADD CONSTRAINT "push_outbox_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "push_outbox" ADD CONSTRAINT "push_outbox_notification_id_notifications_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_session_id_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE;