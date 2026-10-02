CREATE TABLE "group_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"group_id" uuid NOT NULL,
	"url" text NOT NULL,
	"label" text,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_links_group_id_url_unique" UNIQUE("group_id","url")
);
--> statement-breakpoint
ALTER TABLE "group_links" ADD CONSTRAINT "group_links_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;