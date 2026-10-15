DROP TABLE "call_fades";--> statement-breakpoint
DELETE FROM "email_opt_outs" WHERE "type" IN ('call_faded', 'fade_gloated');--> statement-breakpoint
DELETE FROM "email_outbox" WHERE "type" IN ('call_faded', 'fade_gloated');--> statement-breakpoint
DELETE FROM "push_opt_outs" WHERE "type" IN ('call_faded', 'fade_gloated');--> statement-breakpoint
DELETE FROM "push_outbox" WHERE "type" IN ('call_faded', 'fade_gloated');--> statement-breakpoint
DELETE FROM "notifications" WHERE "type" IN ('call_faded', 'fade_gloated');--> statement-breakpoint
UPDATE "presser_questions" SET "status" = 'withdrawn' WHERE "app_template" IN ('faded_and_lost', 'faders_wrong') AND "status" = 'pending';--> statement-breakpoint
UPDATE "presser_questions" SET "app_template" = NULL WHERE "app_template" IN ('faded_and_lost', 'faders_wrong');--> statement-breakpoint
UPDATE "presser_questions" SET "sort_rank" = 2 WHERE "sort_rank" = 3;--> statement-breakpoint
UPDATE "group_recaps" SET "data" = jsonb_set("data", '{moments}', COALESCE((SELECT jsonb_agg(m) FROM jsonb_array_elements("data"->'moments') AS m WHERE m->>'kind' <> 'fade_hit'), '[]'::jsonb)) WHERE "data"->'moments' @> '[{"kind": "fade_hit"}]';--> statement-breakpoint
ALTER TABLE "email_opt_outs" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "email_outbox" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "email_preference_type";--> statement-breakpoint
CREATE TYPE "email_preference_type" AS ENUM('all', 'call_resolved', 'dispute_filed', 'dispute_upheld', 'dispute_overturned', 'question_voided', 'call_voided', 'group_member_joined', 'question_shared_to_group', 'sweep_completed', 'streak_milestone', 'streak_personal_best', 'streak_snapped', 'game_reminder', 'redo_earned', 'group_pins_expired', 'challenge_accepted', 'challenge_settled', 'challenge_gloated', 'challenge_posted_to_group', 'season_starting', 'product_updates');--> statement-breakpoint
ALTER TABLE "email_opt_outs" ALTER COLUMN "type" SET DATA TYPE "email_preference_type" USING "type"::"email_preference_type";--> statement-breakpoint
ALTER TABLE "email_outbox" ALTER COLUMN "type" SET DATA TYPE "email_preference_type" USING "type"::"email_preference_type";--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "push_outbox" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "notification_type";--> statement-breakpoint
CREATE TYPE "notification_type" AS ENUM('call_resolved', 'dispute_filed', 'dispute_upheld', 'dispute_overturned', 'question_voided', 'call_voided', 'group_member_joined', 'question_shared_to_group', 'sweep_completed', 'streak_milestone', 'streak_personal_best', 'streak_snapped', 'game_reminder', 'redo_earned', 'group_pins_expired', 'game_resolved', 'presser_question_received', 'presser_answered', 'challenge_accepted', 'challenge_settled', 'challenge_gloated', 'challenge_posted_to_group');--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "type" SET DATA TYPE "notification_type" USING "type"::"notification_type";--> statement-breakpoint
ALTER TABLE "push_outbox" ALTER COLUMN "type" SET DATA TYPE "notification_type" USING "type"::"notification_type";--> statement-breakpoint
ALTER TABLE "presser_questions" ALTER COLUMN "app_template" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "presser_app_template";--> statement-breakpoint
CREATE TYPE "presser_app_template" AS ENUM('high_conviction_miss', 'redo_flip_lost', 'contrarian_hit', 'contrarian_miss', 'streak_extended', 'perfect_game', 'oh_fer_game', 'game_summary');--> statement-breakpoint
ALTER TABLE "presser_questions" ALTER COLUMN "app_template" SET DATA TYPE "presser_app_template" USING "app_template"::"presser_app_template";--> statement-breakpoint
ALTER TABLE "push_opt_outs" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "push_preference_type";--> statement-breakpoint
CREATE TYPE "push_preference_type" AS ENUM('all', 'call_resolved', 'dispute_filed', 'dispute_upheld', 'dispute_overturned', 'question_voided', 'call_voided', 'group_member_joined', 'question_shared_to_group', 'sweep_completed', 'streak_milestone', 'streak_personal_best', 'streak_snapped', 'game_reminder', 'redo_earned', 'group_pins_expired', 'game_resolved', 'presser_question_received', 'presser_answered', 'challenge_accepted', 'challenge_settled', 'challenge_gloated', 'challenge_posted_to_group');--> statement-breakpoint
ALTER TABLE "push_opt_outs" ALTER COLUMN "type" SET DATA TYPE "push_preference_type" USING "type"::"push_preference_type";--> statement-breakpoint
DROP TYPE "gloat_message";