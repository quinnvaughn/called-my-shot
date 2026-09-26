ALTER TYPE "email_preference_type" ADD VALUE 'call_faded' BEFORE 'season_starting';--> statement-breakpoint
ALTER TYPE "email_preference_type" ADD VALUE 'fade_gloated' BEFORE 'season_starting';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'call_faded';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'fade_gloated';--> statement-breakpoint
CREATE TABLE "call_fades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"fader_call_id" uuid NOT NULL UNIQUE,
	"target_call_id" uuid NOT NULL,
	"target_flipped_at" timestamp,
	"fader_gloated_at" timestamp,
	"target_gloated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "call_id" uuid;--> statement-breakpoint
CREATE INDEX "call_fades_target_call_id_idx" ON "call_fades" ("target_call_id");--> statement-breakpoint
ALTER TABLE "call_fades" ADD CONSTRAINT "call_fades_fader_call_id_calls_id_fkey" FOREIGN KEY ("fader_call_id") REFERENCES "calls"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "call_fades" ADD CONSTRAINT "call_fades_target_call_id_calls_id_fkey" FOREIGN KEY ("target_call_id") REFERENCES "calls"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_call_id_calls_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE SET NULL;