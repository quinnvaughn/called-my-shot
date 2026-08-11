ALTER TABLE "group_invites" DROP CONSTRAINT "group_invites_group_id_key";--> statement-breakpoint
ALTER TABLE "group_invites" ADD COLUMN "created_by" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_group_id_created_by_unique" UNIQUE("group_id","created_by");--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE;