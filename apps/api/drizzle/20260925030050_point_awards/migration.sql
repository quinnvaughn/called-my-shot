CREATE TYPE "point_award_kind" AS ENUM('streak_milestone', 'sweep');--> statement-breakpoint
CREATE TABLE "point_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"league_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"kind" "point_award_kind" NOT NULL,
	"scope_key" text NOT NULL,
	"source_key" text NOT NULL,
	"points" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "point_awards_kind_scope_key_source_key_unique" UNIQUE("kind","scope_key","source_key")
);
--> statement-breakpoint
ALTER TABLE "user_season_stats" ADD COLUMN "bonus_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "point_awards_user_idx" ON "point_awards" ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "point_awards" ADD CONSTRAINT "point_awards_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "point_awards" ADD CONSTRAINT "point_awards_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "point_awards" ADD CONSTRAINT "point_awards_season_id_seasons_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE;