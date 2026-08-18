ALTER TABLE "questions" ADD COLUMN "options_open_field" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "open_field_kind" "numeric_subject_type";