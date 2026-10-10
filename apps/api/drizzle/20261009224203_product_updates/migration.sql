ALTER TYPE "email_preference_type" ADD VALUE 'product_updates';--> statement-breakpoint
CREATE TABLE "update_emails" (
	"user_id" uuid,
	"update_id" uuid,
	"sent_at" timestamp,
	"skipped_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "update_emails_pkey" PRIMARY KEY("user_id","update_id")
);
--> statement-breakpoint
CREATE TABLE "updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body" text NOT NULL,
	"cover_image_key" text,
	"slug" text,
	"published_at" timestamp,
	"emailed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "update_emails_pending_idx" ON "update_emails" ("update_id","created_at") WHERE sent_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "updates_slug_idx" ON "updates" ("slug");--> statement-breakpoint
CREATE INDEX "updates_published_idx" ON "updates" ("published_at") WHERE published_at is not null;--> statement-breakpoint
ALTER TABLE "update_emails" ADD CONSTRAINT "update_emails_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "update_emails" ADD CONSTRAINT "update_emails_update_id_updates_id_fkey" FOREIGN KEY ("update_id") REFERENCES "updates"("id") ON DELETE CASCADE;