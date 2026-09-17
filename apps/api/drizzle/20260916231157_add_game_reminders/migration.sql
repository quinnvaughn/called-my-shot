ALTER TYPE "email_preference_type" ADD VALUE 'game_reminder' BEFORE 'season_starting';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'game_reminder';--> statement-breakpoint
CREATE TABLE "game_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"sent_at" timestamp,
	"skipped_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "game_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "game_reminders_user_game_idx" ON "game_reminders" ("user_id","game_id");--> statement-breakpoint
CREATE INDEX "game_reminders_pending_idx" ON "game_reminders" ("game_id") WHERE sent_at is null;--> statement-breakpoint
ALTER TABLE "game_reminders" ADD CONSTRAINT "game_reminders_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "game_reminders" ADD CONSTRAINT "game_reminders_game_id_games_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_game_id_games_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE SET NULL;