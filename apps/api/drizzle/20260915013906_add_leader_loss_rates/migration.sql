CREATE TABLE "game_question_loss_settings" (
	"league_slug" text,
	"stat_name" text,
	"loss_rate" numeric(4,3) NOT NULL,
	"auto_tune" boolean DEFAULT true NOT NULL,
	"tuned_at" timestamp,
	"updated_by_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "game_question_loss_settings_pkey" PRIMARY KEY("league_slug","stat_name")
);
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "leader_basis" jsonb;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "loss_rate" numeric(4,3);--> statement-breakpoint
ALTER TABLE "game_question_loss_settings" ADD CONSTRAINT "game_question_loss_settings_updated_by_id_users_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL;