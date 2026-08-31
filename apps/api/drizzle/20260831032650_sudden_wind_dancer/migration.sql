ALTER TYPE "slate_status" RENAME TO "ballot_status";--> statement-breakpoint
ALTER TABLE "slate_questions" RENAME TO "ballot_questions";--> statement-breakpoint
ALTER TABLE "slates" RENAME TO "ballots";--> statement-breakpoint
ALTER TABLE "ballot_questions" RENAME COLUMN "slate_id" TO "ballot_id";--> statement-breakpoint
ALTER INDEX "slate_questions_slate_id_sort_order_idx" RENAME TO "ballot_questions_ballot_id_sort_order_idx";