-- Moves every question priced at a 5% PLAYER_EDGE down to 2%, and rescores
-- the misses already settled on them. Covers both the questions
-- 20260925031801_reprice_misses_at_player_edge converted and the ones created
-- at 5% since, which are priced the same way.
--
-- The 5% pass set L5 = L - 0.05(1 + L), so the rate it started from is
-- (L5 + 0.05) / 0.95, and that rate at 2% is L - 0.02(1 + L). L5 was rounded
-- to two places, so the result can land 0.01 above repricing the original
-- directly - never below it. Rounded to two places and held to a 0.05 floor,
-- the same as the code that prices new questions.
--
-- The same questions as the 5% pass, and the same rescoring: only misses
-- change, each one computed the way pointsAtStake does - in double precision,
-- in the same order, rounded half up - with the difference filed on the
-- caller's user_season_stats row for the question's season. No
-- notifications.

UPDATE "questions" SET "loss_rate" = greatest(0.05, round(
	("loss_rate" + 0.05) / 0.95 - 0.02 * (1 + ("loss_rate" + 0.05) / 0.95), 2))
WHERE "shape" NOT IN ('player_stat_numeric_guess', 'team_stat_numeric_guess', 'team_season_stat_numeric_guess', 'player_season_stat_leader')
	AND NOT ("shape" IN ('player_season_award', 'team_season_award') AND coalesce("picks_required", 1) > 1);
--> statement-breakpoint
UPDATE "question_options" o SET "loss_rate" = greatest(0.05, round(
	(o."loss_rate" + 0.05) / 0.95 - 0.02 * (1 + (o."loss_rate" + 0.05) / 0.95), 2))
FROM "questions" q
WHERE o."question_id" = q."id"
	AND o."loss_rate" IS NOT NULL
	AND q."shape" NOT IN ('player_stat_numeric_guess', 'team_stat_numeric_guess', 'team_season_stat_numeric_guess', 'player_season_stat_leader')
	AND NOT (q."shape" IN ('player_season_award', 'team_season_award') AND coalesce(q."picks_required", 1) > 1);
--> statement-breakpoint
WITH rescored AS (
	SELECT
		cs."id",
		c."user_id",
		q."league_id",
		q."season_id",
		cs."result_points" AS old_points,
		-floor(
			(CASE
				WHEN q."shape" = 'player_award_finalists' THEN 200
				WHEN q."shape" IN ('player_season_award', 'team_season_award', 'player_game_stat_leader') THEN 250
				ELSE 150
			END)::float8
			* (cs."conviction"::float8 / 100)
			* coalesce(o."loss_rate", q."loss_rate")::float8
			+ 0.5
		)::int AS new_points
	FROM "call_selections" cs
	JOIN "calls" c ON c."id" = cs."call_id"
	JOIN "question_options" o ON o."id" = cs."option_id"
	JOIN "questions" q ON q."id" = c."question_id"
	WHERE o."is_correct" = false
		AND cs."result_points" IS NOT NULL
		AND q."shape" NOT IN ('player_stat_numeric_guess', 'team_stat_numeric_guess', 'team_season_stat_numeric_guess', 'player_season_stat_leader')
		AND NOT (q."shape" IN ('player_season_award', 'team_season_award') AND coalesce(q."picks_required", 1) > 1)
),
updated AS (
	UPDATE "call_selections" cs SET "result_points" = r.new_points
	FROM rescored r
	WHERE cs."id" = r."id" AND r.new_points <> r.old_points
	RETURNING cs."id"
)
INSERT INTO "user_season_stats" ("user_id", "league_id", "season_id", "points")
SELECT "user_id", "league_id", "season_id", sum(new_points - old_points)::int
FROM rescored
WHERE new_points <> old_points
GROUP BY "user_id", "league_id", "season_id"
ON CONFLICT ("user_id", "season_id")
	DO UPDATE SET "points" = "user_season_stats"."points" + excluded."points";
