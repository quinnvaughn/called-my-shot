ALTER TABLE "questions" ADD COLUMN "generation_key" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "line_basis" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "questions_generation_key_idx" ON "questions" ("generation_key");--> statement-breakpoint
UPDATE "questions" AS q
SET "generation_key" = l."slug" || ':' || q."game_id" || ':team_vs_team'
FROM "leagues" AS l,
	(
		SELECT DISTINCT ON ("game_id") "id"
		FROM "questions"
		WHERE "shape" = 'team_vs_team' AND "game_id" IS NOT NULL
		ORDER BY "game_id", "created_at"
	) AS first_per_game
WHERE q."id" = first_per_game."id" AND l."id" = q."league_id";