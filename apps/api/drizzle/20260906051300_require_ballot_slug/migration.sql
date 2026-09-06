ALTER TABLE "ballots" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_slug_key" UNIQUE("slug");