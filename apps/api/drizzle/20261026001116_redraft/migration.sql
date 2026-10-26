ALTER TYPE "post_kind" ADD VALUE IF NOT EXISTS 'redraft';--> statement-breakpoint
CREATE TABLE "draft_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"league_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"round" integer,
	"overall" integer,
	"team_id" uuid,
	"team_name" text,
	"player_id" uuid,
	"player_name" text NOT NULL,
	CONSTRAINT "draft_entries_undrafted_has_no_round" CHECK ("overall" is not null or "round" is null)
);
--> statement-breakpoint
CREATE TABLE "redraft_picks" (
	"post_id" uuid,
	"slot" integer,
	"player_id" uuid NOT NULL,
	CONSTRAINT "redraft_picks_pkey" PRIMARY KEY("post_id","slot"),
	CONSTRAINT "redraft_picks_post_id_player_id_unique" UNIQUE("post_id","player_id"),
	CONSTRAINT "redraft_picks_slot" CHECK ("slot" >= 1)
);
--> statement-breakpoint
ALTER TABLE "prompts" DROP CONSTRAINT "prompts_code_key";--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "draft_year" integer;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_kind_code_unique" UNIQUE("kind","code");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_entries_pick_idx" ON "draft_entries" ("league_id","year","overall") WHERE "overall" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "draft_entries_player_idx" ON "draft_entries" ("league_id","player_id") WHERE "player_id" is not null;--> statement-breakpoint
CREATE INDEX "draft_entries_class_idx" ON "draft_entries" ("league_id","year");--> statement-breakpoint
CREATE UNIQUE INDEX "prompts_system_draft_idx" ON "prompts" ("kind","league_id","draft_year") WHERE "creator_id" is null and "draft_year" is not null;--> statement-breakpoint
CREATE INDEX "redraft_picks_player_idx" ON "redraft_picks" ("player_id");--> statement-breakpoint
ALTER TABLE "draft_entries" ADD CONSTRAINT "draft_entries_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "draft_entries" ADD CONSTRAINT "draft_entries_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "draft_entries" ADD CONSTRAINT "draft_entries_player_id_players_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "redraft_picks" ADD CONSTRAINT "redraft_picks_post_id_posts_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "redraft_picks" ADD CONSTRAINT "redraft_picks_player_id_players_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_draft_has_league" CHECK ("draft_year" is null or "league_id" is not null);