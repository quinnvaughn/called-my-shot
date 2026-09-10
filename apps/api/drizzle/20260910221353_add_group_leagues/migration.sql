CREATE TABLE "group_leagues" (
	"group_id" uuid,
	"league_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_leagues_pkey" PRIMARY KEY("group_id","league_id")
);
--> statement-breakpoint
ALTER TABLE "group_leagues" ADD CONSTRAINT "group_leagues_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "group_leagues" ADD CONSTRAINT "group_leagues_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;