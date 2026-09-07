ALTER TABLE "users" ADD COLUMN "email_bounced_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_bounce_reason" text;