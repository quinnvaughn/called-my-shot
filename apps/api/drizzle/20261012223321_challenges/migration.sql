CREATE TYPE "gif_provider" AS ENUM('klipy');--> statement-breakpoint
CREATE TYPE "gloat_source" AS ENUM('challenge_creator', 'challenge_acceptor');--> statement-breakpoint
ALTER TYPE "email_preference_type" ADD VALUE 'challenge_accepted' BEFORE 'season_starting';--> statement-breakpoint
ALTER TYPE "email_preference_type" ADD VALUE 'challenge_settled' BEFORE 'season_starting';--> statement-breakpoint
ALTER TYPE "email_preference_type" ADD VALUE 'challenge_gloated' BEFORE 'season_starting';--> statement-breakpoint
ALTER TYPE "email_preference_type" ADD VALUE 'challenge_posted_to_group' BEFORE 'season_starting';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'challenge_accepted';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'challenge_settled';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'challenge_gloated';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'challenge_posted_to_group';--> statement-breakpoint
CREATE TABLE "challenge_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"challenge_id" uuid NOT NULL,
	"acceptor_id" uuid NOT NULL,
	"creator_gloat_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_acceptances_challenge_id_acceptor_id_unique" UNIQUE("challenge_id","acceptor_id")
);
--> statement-breakpoint
CREATE TABLE "challenge_group_posts" (
	"challenge_id" uuid,
	"group_id" uuid,
	"posted_by_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_group_posts_pkey" PRIMARY KEY("challenge_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "challenge_questions" (
	"challenge_id" uuid,
	"question_id" uuid,
	"position" integer NOT NULL,
	CONSTRAINT "challenge_questions_pkey" PRIMARY KEY("challenge_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"code" text NOT NULL UNIQUE,
	"creator_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gloat_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"reporter_id" uuid NOT NULL,
	"gloat_id" uuid NOT NULL,
	"reason" "presser_report_reason" NOT NULL,
	"details" text,
	"status" "presser_report_status" DEFAULT 'open'::"presser_report_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by_admin_id" uuid,
	CONSTRAINT "gloat_reports_reporter_id_gloat_id_unique" UNIQUE("reporter_id","gloat_id")
);
--> statement-breakpoint
CREATE TABLE "gloats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"sender_id" uuid NOT NULL,
	"source" "gloat_source" NOT NULL,
	"challenge_id" uuid NOT NULL,
	"acceptance_id" uuid,
	"text" text,
	"gif_provider" "gif_provider",
	"gif_id" text,
	"gif_url" text,
	"gif_width" integer,
	"gif_height" integer,
	"gif_alt" text,
	"removed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gloats_challenge_id_sender_id_acceptance_id_unique" UNIQUE NULLS NOT DISTINCT("challenge_id","sender_id","acceptance_id"),
	CONSTRAINT "gloats_has_content" CHECK ("text" is not null or "gif_url" is not null)
);
--> statement-breakpoint
ALTER TABLE "call_selections" ADD COLUMN "challenge_points" integer;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "challenge_points" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "challenge_id" uuid;--> statement-breakpoint
CREATE INDEX "challenge_acceptances_acceptor_id_idx" ON "challenge_acceptances" ("acceptor_id");--> statement-breakpoint
CREATE INDEX "challenge_group_posts_group_idx" ON "challenge_group_posts" ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "challenge_questions_question_id_idx" ON "challenge_questions" ("question_id");--> statement-breakpoint
CREATE INDEX "challenges_creator_id_idx" ON "challenges" ("creator_id","created_at");--> statement-breakpoint
CREATE INDEX "gloat_reports_status_idx" ON "gloat_reports" ("status","created_at");--> statement-breakpoint
ALTER TABLE "challenge_acceptances" ADD CONSTRAINT "challenge_acceptances_challenge_id_challenges_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "challenge_acceptances" ADD CONSTRAINT "challenge_acceptances_acceptor_id_users_id_fkey" FOREIGN KEY ("acceptor_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "challenge_group_posts" ADD CONSTRAINT "challenge_group_posts_challenge_id_challenges_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "challenge_group_posts" ADD CONSTRAINT "challenge_group_posts_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "challenge_group_posts" ADD CONSTRAINT "challenge_group_posts_posted_by_id_users_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "challenge_questions" ADD CONSTRAINT "challenge_questions_challenge_id_challenges_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "challenge_questions" ADD CONSTRAINT "challenge_questions_question_id_questions_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_creator_id_users_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gloat_reports" ADD CONSTRAINT "gloat_reports_reporter_id_users_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gloat_reports" ADD CONSTRAINT "gloat_reports_gloat_id_gloats_id_fkey" FOREIGN KEY ("gloat_id") REFERENCES "gloats"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gloat_reports" ADD CONSTRAINT "gloat_reports_reviewed_by_admin_id_users_id_fkey" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "gloats" ADD CONSTRAINT "gloats_sender_id_users_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gloats" ADD CONSTRAINT "gloats_challenge_id_challenges_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gloats" ADD CONSTRAINT "gloats_acceptance_id_challenge_acceptances_id_fkey" FOREIGN KEY ("acceptance_id") REFERENCES "challenge_acceptances"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_challenge_id_challenges_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE;