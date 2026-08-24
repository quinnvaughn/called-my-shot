CREATE TYPE "tolerance_mode" AS ENUM('percentage', 'absolute');--> statement-breakpoint
ALTER TABLE "stat_tolerance_tiers" RENAME COLUMN "tolerance_pct" TO "tolerance_value";--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "numeric_tolerance_absolute" numeric(4,3);--> statement-breakpoint
ALTER TABLE "stat_tolerance_tiers" ADD COLUMN "tolerance_mode" "tolerance_mode" DEFAULT 'percentage'::"tolerance_mode" NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ALTER COLUMN "guess_value" SET DATA TYPE numeric(8,3) USING "guess_value"::numeric(8,3);--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "ou_line" SET DATA TYPE numeric(8,3) USING "ou_line"::numeric(8,3);--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "numeric_actual_value" SET DATA TYPE numeric(8,3) USING "numeric_actual_value"::numeric(8,3);