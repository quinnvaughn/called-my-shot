CREATE TABLE "call_rebalances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"call_id" uuid NOT NULL,
	"ballot_id" uuid NOT NULL,
	"from_guess_value" numeric(8,3) NOT NULL,
	"to_guess_value" numeric(8,3) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "call_rebalances_call_id_idx" ON "call_rebalances" ("call_id");--> statement-breakpoint
ALTER TABLE "call_rebalances" ADD CONSTRAINT "call_rebalances_call_id_calls_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "call_rebalances" ADD CONSTRAINT "call_rebalances_ballot_id_ballots_id_fkey" FOREIGN KEY ("ballot_id") REFERENCES "ballots"("id") ON DELETE CASCADE;