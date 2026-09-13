CREATE TYPE "question_voided_reason" AS ENUM('subject_did_not_play', 'game_not_completed', 'other');--> statement-breakpoint
ALTER TYPE "email_preference_type" ADD VALUE 'call_voided' BEFORE 'group_member_joined';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'call_voided' BEFORE 'group_member_joined';--> statement-breakpoint
ALTER TYPE "question_status" ADD VALUE 'voided';--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "voided_reason" "question_voided_reason";