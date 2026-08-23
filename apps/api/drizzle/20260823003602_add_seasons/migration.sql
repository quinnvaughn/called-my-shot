CREATE TABLE "user_season_stats" (
	"user_id" uuid,
	"league_id" uuid NOT NULL,
	"season_id" uuid,
	"points" integer DEFAULT 0 NOT NULL,
	"resolved_call_count" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "user_season_stats_pkey" PRIMARY KEY("user_id","season_id")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"league_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"display_name" text NOT NULL,
	"regular_season_starts_at" timestamp NOT NULL,
	"regular_season_ends_at" timestamp NOT NULL,
	"postseason_starts_at" timestamp,
	"postseason_ends_at" timestamp,
	CONSTRAINT "seasons_league_id_year_unique" UNIQUE("league_id","year")
);
--> statement-breakpoint
DROP TABLE "user_league_stats";--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "season_id" uuid;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "season_id" uuid;--> statement-breakpoint
CREATE INDEX "user_season_stats_league_points_idx" ON "user_season_stats" ("league_id","points");--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_season_id_seasons_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "user_season_stats" ADD CONSTRAINT "user_season_stats_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_season_stats" ADD CONSTRAINT "user_season_stats_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_season_stats" ADD CONSTRAINT "user_season_stats_season_id_seasons_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_season_id_seasons_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;