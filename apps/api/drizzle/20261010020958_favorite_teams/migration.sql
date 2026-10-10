CREATE TABLE "user_favorite_teams" (
	"user_id" uuid,
	"team_id" uuid,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_favorite_teams_pkey" PRIMARY KEY("user_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "teams_prompt_seen_at" timestamp;--> statement-breakpoint
CREATE INDEX "user_favorite_teams_team_idx" ON "user_favorite_teams" ("team_id");--> statement-breakpoint
ALTER TABLE "user_favorite_teams" ADD CONSTRAINT "user_favorite_teams_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_favorite_teams" ADD CONSTRAINT "user_favorite_teams_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;