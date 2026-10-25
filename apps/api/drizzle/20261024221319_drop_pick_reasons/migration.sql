ALTER TABLE "comments" DROP CONSTRAINT "comments_threads_on_posts_only", ADD CONSTRAINT "comments_threads_on_posts_only" CHECK ("post_id" is not null or ("parent_id" is null and "reply_to_user_id" is null));--> statement-breakpoint
ALTER TABLE "comments" DROP CONSTRAINT "comments_pick_player_id_players_id_fkey";--> statement-breakpoint
ALTER TABLE "comments" DROP CONSTRAINT "comments_pick_top_level_only";--> statement-breakpoint
ALTER TABLE "comments" DROP COLUMN "pick_player_id";--> statement-breakpoint
ALTER TABLE "rushmore_picks" DROP COLUMN "reason";
