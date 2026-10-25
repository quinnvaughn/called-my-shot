ALTER TABLE "player_franchise_stints" ADD COLUMN "positions" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "positions" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "from_year" integer;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "to_year" integer;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_positions_have_league" CHECK (cardinality("positions") = 0 or "league_id" is not null);--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_years_in_order" CHECK ("from_year" is null or "to_year" is null or "from_year" <= "to_year");