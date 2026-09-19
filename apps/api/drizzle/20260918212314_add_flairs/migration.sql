CREATE TYPE "flair_source" AS ENUM('team', 'achievement', 'group', 'purchase');--> statement-breakpoint
CREATE TYPE "flair_status" AS ENUM('active', 'retired');--> statement-breakpoint
CREATE TYPE "flair_unlock" AS ENUM('open', 'grant');--> statement-breakpoint
CREATE TABLE "flairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"key" text UNIQUE,
	"source" "flair_source" NOT NULL,
	"unlock" "flair_unlock" NOT NULL,
	"status" "flair_status" DEFAULT 'active'::"flair_status" NOT NULL,
	"scope_group_id" uuid,
	"created_by_user_id" uuid,
	"team_id" uuid UNIQUE,
	"icon" text,
	"label" text,
	"color" text,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_flairs" (
	"user_id" uuid,
	"flair_id" uuid,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"granted_by_user_id" uuid,
	"note" text,
	CONSTRAINT "user_flairs_pkey" PRIMARY KEY("user_id","flair_id")
);
--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN "equipped_flair_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "equipped_flair_id" uuid;--> statement-breakpoint
CREATE INDEX "flairs_scope_idx" ON "flairs" ("scope_group_id","source","sort_order");--> statement-breakpoint
CREATE INDEX "user_flairs_flair_idx" ON "user_flairs" ("flair_id");--> statement-breakpoint
ALTER TABLE "flairs" ADD CONSTRAINT "flairs_scope_group_id_groups_id_fkey" FOREIGN KEY ("scope_group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "flairs" ADD CONSTRAINT "flairs_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "flairs" ADD CONSTRAINT "flairs_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_equipped_flair_id_flairs_id_fkey" FOREIGN KEY ("equipped_flair_id") REFERENCES "flairs"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "user_flairs" ADD CONSTRAINT "user_flairs_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_flairs" ADD CONSTRAINT "user_flairs_flair_id_flairs_id_fkey" FOREIGN KEY ("flair_id") REFERENCES "flairs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_flairs" ADD CONSTRAINT "user_flairs_granted_by_user_id_users_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_equipped_flair_id_flairs_id_fkey" FOREIGN KEY ("equipped_flair_id") REFERENCES "flairs"("id") ON DELETE SET NULL;