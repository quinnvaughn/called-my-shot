CREATE TABLE "game_question_band_settings" (
	"league_slug" text,
	"stat_name" text,
	"band" integer NOT NULL,
	"auto_tune" boolean DEFAULT true NOT NULL,
	"tuned_at" timestamp,
	"updated_by_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "game_question_band_settings_pkey" PRIMARY KEY("league_slug","stat_name")
);
--> statement-breakpoint
ALTER TABLE "game_question_band_settings" ADD CONSTRAINT "game_question_band_settings_updated_by_id_users_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL;