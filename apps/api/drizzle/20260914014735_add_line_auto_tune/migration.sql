ALTER TABLE "game_question_line_settings" ADD COLUMN "auto_tune" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "game_question_line_settings" ADD COLUMN "tuned_at" timestamp;