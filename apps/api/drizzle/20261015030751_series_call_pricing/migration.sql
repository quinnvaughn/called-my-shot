ALTER TABLE "call_selections" ADD COLUMN "loss_rate" numeric(4,3);--> statement-breakpoint
ALTER TABLE "call_selections" ADD COLUMN "win_mult" numeric(4,2);--> statement-breakpoint
ALTER TABLE "call_selections" ADD COLUMN "model_hit_rate" numeric(4,3);--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "series_games_played" integer;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "series_weight" numeric(4,3);--> statement-breakpoint
ALTER TABLE "postseason_series" ADD COLUMN "team_a_home_win_chance" numeric(4,3);--> statement-breakpoint
ALTER TABLE "postseason_series" ADD COLUMN "team_b_home_win_chance" numeric(4,3);--> statement-breakpoint
-- Every pick so far was made at its option's current price: prices stop
-- moving once a question has a call.
UPDATE "call_selections" AS cs
SET "loss_rate" = qo."loss_rate", "win_mult" = qo."win_mult", "model_hit_rate" = qo."model_hit_rate"
FROM "question_options" AS qo
WHERE qo."id" = cs."option_id";--> statement-breakpoint
-- Series questions locked at Game 1 until now, so every call on one was made
-- before any game was played.
UPDATE "calls" AS c
SET "series_games_played" = 0, "series_weight" = 1
FROM "questions" AS q
WHERE q."id" = c."question_id" AND q."series_id" IS NOT NULL;
