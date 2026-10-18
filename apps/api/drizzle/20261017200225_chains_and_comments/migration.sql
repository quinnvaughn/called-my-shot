CREATE TYPE "chain_link_status" AS ENUM('requested', 'approved', 'declined', 'left', 'released');--> statement-breakpoint
CREATE TYPE "chain_outcome" AS ENUM('held', 'broken');--> statement-breakpoint
CREATE TYPE "comment_kind" AS ENUM('challenge_creator', 'challenge_acceptor', 'chain');--> statement-breakpoint
ALTER TYPE "email_preference_type" ADD VALUE 'chain_link_requested' BEFORE 'season_starting';--> statement-breakpoint
ALTER TYPE "email_preference_type" ADD VALUE 'chain_link_decided' BEFORE 'season_starting';--> statement-breakpoint
ALTER TYPE "email_preference_type" ADD VALUE 'chain_member_left' BEFORE 'season_starting';--> statement-breakpoint
ALTER TYPE "email_preference_type" ADD VALUE 'chain_called_off' BEFORE 'season_starting';--> statement-breakpoint
ALTER TYPE "email_preference_type" ADD VALUE 'chain_settled' BEFORE 'season_starting';--> statement-breakpoint
ALTER TYPE "email_preference_type" ADD VALUE 'chain_commented' BEFORE 'season_starting';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'chain_link_requested';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'chain_link_decided';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'chain_member_left';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'chain_called_off';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'chain_settled';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'chain_commented';--> statement-breakpoint
ALTER TYPE "point_award_kind" ADD VALUE 'chain';--> statement-breakpoint
ALTER TYPE "push_preference_type" ADD VALUE 'chain_link_requested';--> statement-breakpoint
ALTER TYPE "push_preference_type" ADD VALUE 'chain_link_decided';--> statement-breakpoint
ALTER TYPE "push_preference_type" ADD VALUE 'chain_member_left';--> statement-breakpoint
ALTER TYPE "push_preference_type" ADD VALUE 'chain_called_off';--> statement-breakpoint
ALTER TYPE "push_preference_type" ADD VALUE 'chain_settled';--> statement-breakpoint
ALTER TYPE "push_preference_type" ADD VALUE 'chain_commented';--> statement-breakpoint
CREATE TABLE "chain_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"chain_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"hit_chance" numeric(4,3) NOT NULL,
	"status" "chain_link_status" DEFAULT 'requested'::"chain_link_status" NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp,
	"left_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "chain_recompute_queue" (
	"chain_id" uuid PRIMARY KEY,
	"dirtied_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"code" text NOT NULL UNIQUE,
	"group_id" uuid NOT NULL,
	"starter_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"cancelled_at" timestamp,
	"announced_outcome" "chain_outcome",
	"announced_breaker_link_id" uuid
);
--> statement-breakpoint
CREATE TABLE "comment_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"reporter_id" uuid NOT NULL,
	"comment_id" uuid NOT NULL,
	"reason" "presser_report_reason" NOT NULL,
	"details" text,
	"status" "presser_report_status" DEFAULT 'open'::"presser_report_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by_admin_id" uuid,
	CONSTRAINT "comment_reports_reporter_id_comment_id_unique" UNIQUE("reporter_id","comment_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"sender_id" uuid NOT NULL,
	"kind" "comment_kind" NOT NULL,
	"challenge_id" uuid,
	"acceptance_id" uuid,
	"chain_id" uuid,
	"text" text,
	"gif_provider" "gif_provider",
	"gif_id" text,
	"gif_url" text,
	"gif_width" integer,
	"gif_height" integer,
	"gif_alt" text,
	"removed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "comments_has_content" CHECK ("text" is not null or "gif_url" is not null),
	CONSTRAINT "comments_one_target" CHECK (("challenge_id" is null) <> ("chain_id" is null))
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "chain_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "chain_links_active_call_idx" ON "chain_links" ("call_id") WHERE status in ('requested', 'approved');--> statement-breakpoint
CREATE UNIQUE INDEX "chain_links_active_member_idx" ON "chain_links" ("chain_id","user_id") WHERE status in ('requested', 'approved');--> statement-breakpoint
CREATE UNIQUE INDEX "chain_links_question_idx" ON "chain_links" ("chain_id","question_id") WHERE status = 'approved';--> statement-breakpoint
CREATE UNIQUE INDEX "chain_links_game_idx" ON "chain_links" ("chain_id","game_id") WHERE status = 'approved';--> statement-breakpoint
CREATE INDEX "chain_links_chain_idx" ON "chain_links" ("chain_id");--> statement-breakpoint
CREATE INDEX "chain_links_question_id_idx" ON "chain_links" ("question_id");--> statement-breakpoint
CREATE INDEX "chain_links_user_idx" ON "chain_links" ("user_id");--> statement-breakpoint
CREATE INDEX "chains_group_created_idx" ON "chains" ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "comment_reports_status_idx" ON "comment_reports" ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "comments_challenge_sender_idx" ON "comments" ("challenge_id","sender_id",coalesce("acceptance_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "challenge_id" is not null;--> statement-breakpoint
CREATE INDEX "comments_chain_created_idx" ON "comments" ("chain_id","created_at") WHERE "chain_id" is not null;--> statement-breakpoint
ALTER TABLE "chain_links" ADD CONSTRAINT "chain_links_chain_id_chains_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "chains"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chain_links" ADD CONSTRAINT "chain_links_call_id_calls_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chain_links" ADD CONSTRAINT "chain_links_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chain_links" ADD CONSTRAINT "chain_links_question_id_questions_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chain_links" ADD CONSTRAINT "chain_links_game_id_games_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chain_recompute_queue" ADD CONSTRAINT "chain_recompute_queue_chain_id_chains_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "chains"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chains" ADD CONSTRAINT "chains_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chains" ADD CONSTRAINT "chains_starter_id_users_id_fkey" FOREIGN KEY ("starter_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_reporter_id_users_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_comment_id_comments_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_reviewed_by_admin_id_users_id_fkey" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_sender_id_users_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_challenge_id_challenges_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_acceptance_id_challenge_acceptances_id_fkey" FOREIGN KEY ("acceptance_id") REFERENCES "challenge_acceptances"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_chain_id_chains_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "chains"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_chain_id_chains_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "chains"("id") ON DELETE CASCADE;--> statement-breakpoint
INSERT INTO "comments" ("id", "sender_id", "kind", "challenge_id", "acceptance_id", "text", "gif_provider", "gif_id", "gif_url", "gif_width", "gif_height", "gif_alt", "removed_at", "created_at") SELECT "id", "sender_id", "source"::text::"comment_kind", "challenge_id", "acceptance_id", "text", "gif_provider", "gif_id", "gif_url", "gif_width", "gif_height", "gif_alt", "removed_at", "created_at" FROM "gloats";--> statement-breakpoint
INSERT INTO "comment_reports" ("id", "reporter_id", "comment_id", "reason", "details", "status", "created_at", "reviewed_at", "reviewed_by_admin_id") SELECT "id", "reporter_id", "gloat_id", "reason", "details", "status", "created_at", "reviewed_at", "reviewed_by_admin_id" FROM "gloat_reports";
