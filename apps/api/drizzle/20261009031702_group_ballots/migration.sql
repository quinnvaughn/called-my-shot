CREATE TABLE "group_ballots" (
	"group_id" uuid,
	"ballot_id" uuid,
	"added_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_ballots_pkey" PRIMARY KEY("group_id","ballot_id")
);
--> statement-breakpoint
-- Ballots pinned before they had their own table carry over as group ballots,
-- and leave group_pins so question_id can be required.
INSERT INTO "group_ballots" ("group_id", "ballot_id", "added_by", "created_at") SELECT "group_id", "ballot_id", "pinned_by", "created_at" FROM "group_pins" WHERE "ballot_id" IS NOT NULL;--> statement-breakpoint
DELETE FROM "group_pins" WHERE "ballot_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "group_pins" DROP CONSTRAINT "group_pins_ballot_id_ballots_id_fkey";--> statement-breakpoint
ALTER TABLE "group_pins" DROP CONSTRAINT "group_pins_group_id_ballot_id_unique";--> statement-breakpoint
ALTER TABLE "group_pins" DROP CONSTRAINT "group_pins_one_target";--> statement-breakpoint
DROP INDEX "group_pins_ballot_id_idx";--> statement-breakpoint
ALTER TABLE "group_pins" DROP COLUMN "ballot_id";--> statement-breakpoint
ALTER TABLE "group_pins" ALTER COLUMN "question_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "group_ballots_ballot_id_idx" ON "group_ballots" ("ballot_id");--> statement-breakpoint
ALTER TABLE "group_ballots" ADD CONSTRAINT "group_ballots_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "group_ballots" ADD CONSTRAINT "group_ballots_ballot_id_ballots_id_fkey" FOREIGN KEY ("ballot_id") REFERENCES "ballots"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "group_ballots" ADD CONSTRAINT "group_ballots_added_by_users_id_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE SET NULL;