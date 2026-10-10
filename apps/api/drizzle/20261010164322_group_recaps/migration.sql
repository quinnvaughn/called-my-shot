CREATE TABLE "group_recaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"group_id" uuid NOT NULL,
	"week_key" text NOT NULL,
	"week_start" timestamp NOT NULL,
	"week_end" timestamp NOT NULL,
	"data" jsonb NOT NULL,
	"share_token" text NOT NULL UNIQUE,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_recaps_group_id_week_key_unique" UNIQUE("group_id","week_key")
);
--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN "hidden_from_recaps" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "recap_links_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "recap_shows_worst_miss" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "group_members" DROP COLUMN "invite_card_dismissed_at";--> statement-breakpoint
ALTER TABLE "group_recaps" ADD CONSTRAINT "group_recaps_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;