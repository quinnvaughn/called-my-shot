ALTER TABLE "question_auto_resolutions" ADD COLUMN "awaiting_final" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "question_live_readings" ADD COLUMN "clinched_since" timestamp;