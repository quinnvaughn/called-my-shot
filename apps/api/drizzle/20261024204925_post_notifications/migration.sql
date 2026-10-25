ALTER TYPE "notification_type" ADD VALUE 'post_commented';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'comment_replied';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'user_followed';--> statement-breakpoint
ALTER TYPE "push_preference_type" ADD VALUE 'post_commented';--> statement-breakpoint
ALTER TYPE "push_preference_type" ADD VALUE 'comment_replied';--> statement-breakpoint
ALTER TYPE "push_preference_type" ADD VALUE 'user_followed';--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "post_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "comment_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_id_posts_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_comments_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE;