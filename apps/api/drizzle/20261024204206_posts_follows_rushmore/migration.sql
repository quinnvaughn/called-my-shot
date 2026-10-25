CREATE TYPE "follow_target_kind" AS ENUM('user', 'league', 'team', 'player');--> statement-breakpoint
CREATE TYPE "post_kind" AS ENUM('rushmore');--> statement-breakpoint
CREATE TYPE "post_tag_role" AS ENUM('subject', 'mention');--> statement-breakpoint
CREATE TYPE "space_kind" AS ENUM('league', 'team', 'player');--> statement-breakpoint
ALTER TYPE "comment_kind" ADD VALUE 'post';--> statement-breakpoint
ALTER TYPE "sync_source" ADD VALUE 'bref';--> statement-breakpoint
ALTER TYPE "sync_source" ADD VALUE 'mlbam';--> statement-breakpoint
ALTER TYPE "sync_source" ADD VALUE 'nhl';--> statement-breakpoint
ALTER TYPE "sync_source" ADD VALUE 'nflverse';--> statement-breakpoint
CREATE TABLE "comment_likes" (
	"comment_id" uuid,
	"user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "comment_likes_pkey" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" uuid,
	"target_kind" "follow_target_kind",
	"target_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "follows_pkey" PRIMARY KEY("follower_id","target_kind","target_id")
);
--> statement-breakpoint
CREATE TABLE "player_franchise_stints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"player_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"first_season" integer NOT NULL,
	"last_season" integer NOT NULL,
	"seasons" integer NOT NULL,
	"games" integer,
	"score" numeric(10,3) DEFAULT '0' NOT NULL,
	"hall_of_fame" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "player_franchise_stints_player_id_team_id_unique" UNIQUE("player_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"post_id" uuid,
	"user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "post_likes_pkey" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "post_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"reporter_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"reason" "presser_report_reason" NOT NULL,
	"details" text,
	"status" "presser_report_status" DEFAULT 'open'::"presser_report_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by_admin_id" uuid,
	CONSTRAINT "post_reports_reporter_id_post_id_unique" UNIQUE("reporter_id","post_id")
);
--> statement-breakpoint
CREATE TABLE "post_tags" (
	"post_id" uuid,
	"space_kind" "space_kind",
	"space_id" uuid,
	"role" "post_tag_role" NOT NULL,
	CONSTRAINT "post_tags_pkey" PRIMARY KEY("post_id","space_kind","space_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"author_id" uuid NOT NULL,
	"kind" "post_kind" NOT NULL,
	"prompt_id" uuid NOT NULL,
	"group_id" uuid,
	"body" text,
	"edited_at" timestamp,
	"removed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"kind" "post_kind" NOT NULL,
	"code" text NOT NULL UNIQUE,
	"creator_id" uuid,
	"title" text NOT NULL,
	"league_id" uuid NOT NULL,
	"team_id" uuid,
	"removed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rushmore_picks" (
	"post_id" uuid,
	"player_id" uuid,
	"position" integer NOT NULL,
	"reason" text,
	CONSTRAINT "rushmore_picks_pkey" PRIMARY KEY("post_id","player_id"),
	CONSTRAINT "rushmore_picks_post_id_position_unique" UNIQUE("post_id","position"),
	CONSTRAINT "rushmore_picks_position" CHECK ("position" between 0 and 3)
);
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "post_id" uuid;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "reply_to_user_id" uuid;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "pick_player_id" uuid;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "portrait_key" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "portrait_checked_at" timestamp;--> statement-breakpoint
CREATE INDEX "comments_post_parent_created_idx" ON "comments" ("post_id","parent_id","created_at") WHERE "post_id" is not null;--> statement-breakpoint
CREATE INDEX "follows_target_idx" ON "follows" ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "player_franchise_stints_team_score_idx" ON "player_franchise_stints" ("team_id","score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "post_likes_user_idx" ON "post_likes" ("user_id");--> statement-breakpoint
CREATE INDEX "post_reports_status_idx" ON "post_reports" ("status","created_at");--> statement-breakpoint
CREATE INDEX "post_tags_space_idx" ON "post_tags" ("space_kind","space_id");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_public_answer_idx" ON "posts" ("author_id","prompt_id") WHERE "group_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "posts_group_answer_idx" ON "posts" ("author_id","prompt_id","group_id") WHERE "group_id" is not null;--> statement-breakpoint
CREATE INDEX "posts_created_idx" ON "posts" ("created_at","id");--> statement-breakpoint
CREATE INDEX "posts_prompt_idx" ON "posts" ("prompt_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_author_idx" ON "posts" ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_group_idx" ON "posts" ("group_id","created_at") WHERE "group_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "prompts_system_team_idx" ON "prompts" ("kind","team_id") WHERE "creator_id" is null and "team_id" is not null;--> statement-breakpoint
CREATE INDEX "prompts_league_idx" ON "prompts" ("league_id");--> statement-breakpoint
CREATE INDEX "rushmore_picks_player_idx" ON "rushmore_picks" ("player_id");--> statement-breakpoint
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_comment_id_comments_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_reply_to_user_id_users_id_fkey" FOREIGN KEY ("reply_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_pick_player_id_players_id_fkey" FOREIGN KEY ("pick_player_id") REFERENCES "players"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "player_franchise_stints" ADD CONSTRAINT "player_franchise_stints_player_id_players_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "player_franchise_stints" ADD CONSTRAINT "player_franchise_stints_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "post_reports" ADD CONSTRAINT "post_reports_reporter_id_users_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "post_reports" ADD CONSTRAINT "post_reports_post_id_posts_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "post_reports" ADD CONSTRAINT "post_reports_reviewed_by_admin_id_users_id_fkey" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_post_id_posts_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_prompt_id_prompts_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "prompts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_creator_id_users_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "rushmore_picks" ADD CONSTRAINT "rushmore_picks_post_id_posts_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "rushmore_picks" ADD CONSTRAINT "rushmore_picks_player_id_players_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_threads_on_posts_only" CHECK ("post_id" is not null or ("parent_id" is null and "reply_to_user_id" is null and "pick_player_id" is null));--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_pick_top_level_only" CHECK ("parent_id" is null or "pick_player_id" is null);--> statement-breakpoint
ALTER TABLE "comments" DROP CONSTRAINT "comments_one_target", ADD CONSTRAINT "comments_one_target" CHECK (num_nonnulls("challenge_id", "chain_id", "post_id") = 1);--> statement-breakpoint
-- Everyone already here follows every active league, so nobody's rail or Home
-- empties out on the day follows start deciding what they show.
INSERT INTO "follows" ("follower_id", "target_kind", "target_id")
SELECT "users"."id", 'league'::"follow_target_kind", "leagues"."id"
FROM "users" CROSS JOIN "leagues"
WHERE "leagues"."status" = 'active'
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- And the teams they picked as favorites, plus those teams' leagues.
INSERT INTO "follows" ("follower_id", "target_kind", "target_id")
SELECT "user_id", 'team'::"follow_target_kind", "team_id" FROM "user_favorite_teams"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "follows" ("follower_id", "target_kind", "target_id")
SELECT DISTINCT "user_favorite_teams"."user_id", 'league'::"follow_target_kind", "teams"."league_id"
FROM "user_favorite_teams" JOIN "teams" ON "teams"."id" = "user_favorite_teams"."team_id"
ON CONFLICT DO NOTHING;
