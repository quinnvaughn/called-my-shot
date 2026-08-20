CREATE TABLE "user_league_stats" (
	"user_id" uuid,
	"league_id" uuid,
	"points" integer DEFAULT 0 NOT NULL,
	"resolved_call_count" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "user_league_stats_pkey" PRIMARY KEY("user_id","league_id")
);
--> statement-breakpoint
CREATE INDEX "user_league_stats_league_points_idx" ON "user_league_stats" ("league_id","points");--> statement-breakpoint
ALTER TABLE "user_league_stats" ADD CONSTRAINT "user_league_stats_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_league_stats" ADD CONSTRAINT "user_league_stats_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;