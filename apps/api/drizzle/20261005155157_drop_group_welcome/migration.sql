ALTER TABLE "group_members" DROP CONSTRAINT "group_members_welcome_call_id_calls_id_fkey";--> statement-breakpoint
ALTER TABLE "group_members" DROP COLUMN "welcome_dismissed_at";--> statement-breakpoint
ALTER TABLE "group_members" DROP COLUMN "welcome_call_id";--> statement-breakpoint
ALTER TABLE "groups" DROP COLUMN "welcome_message";