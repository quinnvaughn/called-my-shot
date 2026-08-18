CREATE TABLE "stat_tolerance_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL UNIQUE,
	"tolerance_pct" numeric(4,3) NOT NULL
);
--> statement-breakpoint
INSERT INTO "stat_tolerance_tiers" ("name", "tolerance_pct") VALUES
	('Low-Count Box Stat', 0.150),
	('High-Volume', 0.100);
--> statement-breakpoint
-- Nullable first - existing rows (none yet in dev, real ones eventually in
-- prod) can't satisfy NOT NULL until the backfill below has run.
ALTER TABLE "stats" ADD COLUMN "tolerance_tier_id" uuid;--> statement-breakpoint
ALTER TABLE "stats" ADD CONSTRAINT "stats_tolerance_tier_id_stat_tolerance_tiers_id_fkey" FOREIGN KEY ("tolerance_tier_id") REFERENCES "stat_tolerance_tiers"("id") ON DELETE RESTRICT;
--> statement-breakpoint
UPDATE "stats" SET "tolerance_tier_id" = (SELECT "id" FROM "stat_tolerance_tiers" WHERE "name" = 'Low-Count Box Stat')
	WHERE "name" IN ('3-Pointers Made', 'Rebounds', 'Assists', 'Turnovers', 'Steals', 'Blocks', 'Passing Touchdowns', 'Rushing Touchdowns', 'Receiving Touchdowns', 'Receptions', 'Sacks', 'Interceptions');
--> statement-breakpoint
UPDATE "stats" SET "tolerance_tier_id" = (SELECT "id" FROM "stat_tolerance_tiers" WHERE "name" = 'High-Volume')
	WHERE "name" IN ('Points', 'Passing Yards', 'Rushing Yards', 'Receiving Yards');
--> statement-breakpoint
-- Anything that doesn't match a name above (shouldn't happen against the
-- current catalog, but a migration shouldn't hard-fail on an unclassified
-- row instead of just being conservative) falls back to the looser tier
-- rather than blocking the NOT NULL below.
UPDATE "stats" SET "tolerance_tier_id" = (SELECT "id" FROM "stat_tolerance_tiers" WHERE "name" = 'Low-Count Box Stat')
	WHERE "tolerance_tier_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "stats" ALTER COLUMN "tolerance_tier_id" SET NOT NULL;
