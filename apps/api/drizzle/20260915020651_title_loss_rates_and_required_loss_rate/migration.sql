CREATE TABLE "title_loss_settings" (
	"league_slug" text,
	"award_name" text,
	"loss_rate" numeric(4,3) NOT NULL,
	"auto_tune" boolean DEFAULT true NOT NULL,
	"tuned_at" timestamp,
	"updated_by_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "title_loss_settings_pkey" PRIMARY KEY("league_slug","award_name")
);
--> statement-breakpoint
-- Every question created before loss rates were saved on it keeps the rate it
-- has been scored at, so no open question changes under its callers.
UPDATE "questions" SET "loss_rate" = CASE "shape"
	WHEN 'player_stat_numeric_guess' THEN 0.5
	WHEN 'team_stat_numeric_guess' THEN 0.5
	WHEN 'team_season_stat_numeric_guess' THEN 0.5
	WHEN 'player_game_stat_leader' THEN 0.25
	WHEN 'player_season_stat_leader' THEN 0.25
	ELSE 1
END WHERE "loss_rate" IS NULL;--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "loss_rate" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "title_loss_settings" ADD CONSTRAINT "title_loss_settings_updated_by_id_users_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL;