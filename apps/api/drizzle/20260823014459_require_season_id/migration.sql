ALTER TABLE "questions" ALTER COLUMN "season_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ALTER COLUMN "season_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" DROP CONSTRAINT "questions_season_id_seasons_id_fkey", ADD CONSTRAINT "questions_season_id_seasons_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "games" DROP CONSTRAINT "games_season_id_seasons_id_fkey", ADD CONSTRAINT "games_season_id_seasons_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT;