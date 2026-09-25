-- Moves every question created before PLAYER_EDGE (packages/scoring) onto
-- it, and rescores the misses already settled on them.
--
-- A rate priced at break-even for a pick hitting p of the time is
-- L = p / (1 - p). The same pick priced at the edge e is (p - e) / (1 - p),
-- which works out to L - e(1 + L). Applied to every rate that's derived from
-- a hit rate: coin flips, priced over/under sides, finalists, single-pick
-- awards and titles, game stat leaders. Rounded to two places and held to a
-- 0.05 floor, the same as the code that prices new questions.
--
-- Left alone, because new questions of these kinds are created at the same
-- rate as before: numeric guesses (their edge comes from a wider band, which
-- can't be applied to a guess that's already settled), season stat leaders,
-- and awards asked with several picks.
--
-- Only misses change. A hit's points never depend on the loss rate. Each
-- miss is rescored the way pointsAtStake computes it - in double precision,
-- in the same order, rounded half up - and the difference goes onto the
-- caller's user_season_stats row for the question's season, created if it
-- isn't there, the same way resolution files a result. No notifications:
-- nobody's result flips, every miss just costs a little less.
--
-- In a migration rather than a script because it has to run exactly once per
-- database, before any question is created at the new rates.

UPDATE "questions" SET "loss_rate" = greatest(0.05, round("loss_rate" - 0.05 * (1 + "loss_rate"), 2))
WHERE "shape" NOT IN ('player_stat_numeric_guess', 'team_stat_numeric_guess', 'team_season_stat_numeric_guess', 'player_season_stat_leader')
	AND NOT ("shape" IN ('player_season_award', 'team_season_award') AND coalesce("picks_required", 1) > 1);
--> statement-breakpoint
UPDATE "question_options" o SET "loss_rate" = greatest(0.05, round(o."loss_rate" - 0.05 * (1 + o."loss_rate"), 2))
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
