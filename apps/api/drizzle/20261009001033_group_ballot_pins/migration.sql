ALTER TABLE "group_pins" ADD COLUMN "id" uuid DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "group_pins" ADD COLUMN "ballot_id" uuid;--> statement-breakpoint
ALTER TABLE "group_pins" DROP CONSTRAINT "group_pins_pkey";--> statement-breakpoint
ALTER TABLE "group_pins" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "group_pins" ALTER COLUMN "question_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "group_pins" ADD CONSTRAINT "group_pins_group_id_question_id_unique" UNIQUE("group_id","question_id");--> statement-breakpoint
ALTER TABLE "group_pins" ADD CONSTRAINT "group_pins_group_id_ballot_id_unique" UNIQUE("group_id","ballot_id");--> statement-breakpoint
CREATE INDEX "group_pins_ballot_id_idx" ON "group_pins" ("ballot_id");--> statement-breakpoint
ALTER TABLE "group_pins" ADD CONSTRAINT "group_pins_ballot_id_ballots_id_fkey" FOREIGN KEY ("ballot_id") REFERENCES "ballots"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "group_pins" ADD CONSTRAINT "group_pins_one_target" CHECK (num_nonnulls("question_id", "ballot_id") = 1);