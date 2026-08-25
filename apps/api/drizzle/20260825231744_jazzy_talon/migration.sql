ALTER TABLE "questions" ADD COLUMN "award_rookie_only" boolean;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "rookie_eligible" boolean DEFAULT false NOT NULL;