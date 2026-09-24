CREATE TYPE "redo_grant_source" AS ENUM('referral', 'welcome', 'admin');--> statement-breakpoint
CREATE TYPE "referral_source" AS ENUM('invite_link', 'manual_code');--> statement-breakpoint
CREATE TYPE "referral_status" AS ENUM('pending', 'qualified', 'granted', 'rejected');--> statement-breakpoint
CREATE TABLE "call_redo_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"redo_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"conviction" integer NOT NULL,
	CONSTRAINT "call_redo_selections_redo_id_option_id_unique" UNIQUE("redo_id","option_id")
);
--> statement-breakpoint
CREATE TABLE "call_redos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"call_id" uuid NOT NULL UNIQUE,
	"grant_id" uuid NOT NULL,
	"original_created_at" timestamp NOT NULL,
	"original_guess_value" numeric(8,3),
	"original_conviction" integer,
	"original_case_text" text,
	"redone_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redo_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"source" "redo_grant_source" NOT NULL,
	"referral_id" uuid,
	"consumed_by_call_id" uuid,
	"consumed_at" timestamp,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL UNIQUE,
	"code" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"referrer_id" uuid NOT NULL,
	"invitee_id" uuid NOT NULL UNIQUE,
	"code" text NOT NULL,
	"source" "referral_source" NOT NULL,
	"status" "referral_status" DEFAULT 'pending'::"referral_status" NOT NULL,
	"season_id" uuid,
	"first_call_id" uuid,
	"qualified_at" timestamp,
	"signup_ip" text,
	"invitee_verified_at_qualify" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "redo_grants_unconsumed_idx" ON "redo_grants" ("user_id","created_at") WHERE consumed_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "redo_grants_referral_source_idx" ON "redo_grants" ("referral_id","source") WHERE referral_id is not null;--> statement-breakpoint
CREATE INDEX "referrals_waiting_idx" ON "referrals" ("referrer_id","qualified_at") WHERE status = 'qualified';--> statement-breakpoint
CREATE INDEX "referrals_referrer_idx" ON "referrals" ("referrer_id","season_id");--> statement-breakpoint
ALTER TABLE "call_redo_selections" ADD CONSTRAINT "call_redo_selections_redo_id_call_redos_id_fkey" FOREIGN KEY ("redo_id") REFERENCES "call_redos"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "call_redo_selections" ADD CONSTRAINT "call_redo_selections_option_id_question_options_id_fkey" FOREIGN KEY ("option_id") REFERENCES "question_options"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "call_redos" ADD CONSTRAINT "call_redos_call_id_calls_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "call_redos" ADD CONSTRAINT "call_redos_grant_id_redo_grants_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "redo_grants"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "redo_grants" ADD CONSTRAINT "redo_grants_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "redo_grants" ADD CONSTRAINT "redo_grants_referral_id_referrals_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "redo_grants" ADD CONSTRAINT "redo_grants_consumed_by_call_id_calls_id_fkey" FOREIGN KEY ("consumed_by_call_id") REFERENCES "calls"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_invitee_id_users_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_season_id_seasons_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_first_call_id_calls_id_fkey" FOREIGN KEY ("first_call_id") REFERENCES "calls"("id") ON DELETE SET NULL;