ALTER TABLE "question_options" ADD COLUMN "loss_rate" numeric(4,3);--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "line_pricing" jsonb;