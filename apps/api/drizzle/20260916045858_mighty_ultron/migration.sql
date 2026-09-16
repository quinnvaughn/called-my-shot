ALTER TABLE "user_season_stats" ADD COLUMN "conviction_sum" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_season_stats" ADD COLUMN "conviction_sum_correct" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Backfill both sums from the calls already scored, so an existing caller's
-- conviction edge is right the first time it renders instead of only counting
-- picks resolved from here on. Mirrors callContribution's semantics exactly:
-- selections first, the call row itself only for a numeric guess (no
-- selections), and "scored" means result_points is not null - which also
-- excludes voided questions for free, since markQuestionVoided nulls
-- result_points on both tables.
WITH scored AS (
	SELECT c.user_id, q.season_id, cs.conviction, o.is_correct
	FROM call_selections cs
	JOIN calls c ON c.id = cs.call_id
	JOIN questions q ON q.id = c.question_id
	JOIN question_options o ON o.id = cs.option_id
	WHERE cs.result_points IS NOT NULL
		AND c.unscored_reason IS NULL
	UNION ALL
	SELECT c.user_id, q.season_id, c.conviction, c.hit_tolerance
	FROM calls c
	JOIN questions q ON q.id = c.question_id
	WHERE c.result_points IS NOT NULL
		AND c.conviction IS NOT NULL
		AND c.unscored_reason IS NULL
		AND NOT EXISTS (SELECT 1 FROM call_selections cs WHERE cs.call_id = c.id)
),
agg AS (
	SELECT user_id, season_id,
		sum(conviction) AS sum_all,
		sum(CASE WHEN is_correct THEN conviction ELSE 0 END) AS sum_correct
	FROM scored
	GROUP BY user_id, season_id
)
UPDATE user_season_stats s
SET conviction_sum = agg.sum_all,
	conviction_sum_correct = agg.sum_correct
FROM agg
WHERE s.user_id = agg.user_id AND s.season_id = agg.season_id;
