CREATE TABLE "analytics_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"event" text NOT NULL,
	"properties" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE INDEX "analytics_outbox_pending_idx" ON "analytics_outbox" ("created_at") WHERE sent_at is null;--> statement-breakpoint
ALTER TABLE "analytics_outbox" ADD CONSTRAINT "analytics_outbox_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;