CREATE TYPE "stat_aggregation" AS ENUM('total', 'per_game');--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "stat_aggregation" "stat_aggregation";