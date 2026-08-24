ALTER TABLE "questions" ADD COLUMN "award_conferences" text[];--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "award_divisions" text[];--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "award_positions" text[];--> statement-breakpoint
UPDATE "questions" SET "award_conferences" = ARRAY["award_conference"] WHERE "award_conference" IS NOT NULL;--> statement-breakpoint
UPDATE "questions" SET "award_divisions" = ARRAY["award_division"] WHERE "award_division" IS NOT NULL;--> statement-breakpoint
UPDATE "questions" SET "award_positions" = ARRAY["award_position"] WHERE "award_position" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "award_conference";--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "award_division";--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "award_position";