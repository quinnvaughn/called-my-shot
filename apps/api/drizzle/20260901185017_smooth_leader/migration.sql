CREATE TABLE "team_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"team_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"ties" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_records_team_id_season_id_unique" UNIQUE("team_id","season_id")
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "venue" text;--> statement-breakpoint
ALTER TABLE "team_records" ADD CONSTRAINT "team_records_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "team_records" ADD CONSTRAINT "team_records_season_id_seasons_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE;