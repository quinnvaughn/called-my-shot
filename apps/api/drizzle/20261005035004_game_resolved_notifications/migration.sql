ALTER TYPE "notification_type" ADD VALUE 'game_resolved';--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_key_idx" ON "notifications" ("user_id","dedupe_key");