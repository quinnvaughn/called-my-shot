CREATE TABLE "game_question_line_settings" (
	"league_slug" text,
	"template_id" text,
	"shade" numeric(5,3) NOT NULL,
	"min_line" numeric(8,3) NOT NULL,
	"min_games" integer NOT NULL,
	"updated_by_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "game_question_line_settings_pkey" PRIMARY KEY("league_slug","template_id")
);
--> statement-breakpoint
ALTER TABLE "game_question_line_settings" ADD CONSTRAINT "game_question_line_settings_updated_by_id_users_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL;