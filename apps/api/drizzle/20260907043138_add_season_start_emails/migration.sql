ALTER TYPE "email_preference_type" ADD VALUE 'season_starting';--> statement-breakpoint
CREATE TABLE "season_start_emails" (
	"user_id" uuid,
	"season_id" uuid,
	"sent_at" timestamp,
	"skipped_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "season_start_emails_pkey" PRIMARY KEY("user_id","season_id")
);
--> statement-breakpoint
CREATE INDEX "season_start_emails_pending_idx" ON "season_start_emails" ("season_id","created_at") WHERE sent_at is null;--> statement-breakpoint
ALTER TABLE "season_start_emails" ADD CONSTRAINT "season_start_emails_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "season_start_emails" ADD CONSTRAINT "season_start_emails_season_id_seasons_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE;