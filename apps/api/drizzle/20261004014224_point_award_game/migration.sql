ALTER TABLE "point_awards" ADD COLUMN "game_id" uuid;--> statement-breakpoint
CREATE INDEX "point_awards_user_game_idx" ON "point_awards" ("user_id","game_id");--> statement-breakpoint
ALTER TABLE "point_awards" ADD CONSTRAINT "point_awards_game_id_games_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE SET NULL;