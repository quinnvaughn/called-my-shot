-- One-time backfill for question_options.model_hit_rate (see the previous
-- migration). Every priced over/under already stores the model's over chance
-- on questions.line_pricing, so each side takes its own share of it.
UPDATE "question_options" AS o
SET "model_hit_rate" = ROUND(
	CASE o."label"
		WHEN 'Over' THEN (q."line_pricing"->>'pOver')::numeric
		ELSE 1 - (q."line_pricing"->>'pOver')::numeric
	END,
	3
)
FROM "questions" AS q
WHERE o."question_id" = q."id"
	AND q."line_pricing" IS NOT NULL
	AND o."label" IN ('Over', 'Under')
	AND o."model_hit_rate" IS NULL;
