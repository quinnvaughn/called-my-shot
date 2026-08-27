CREATE TYPE "slate_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "slate_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slate_id" uuid NOT NULL,
	"question_id" uuid NOT NULL UNIQUE,
	"label" text NOT NULL,
	"slot" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"sport_id" uuid NOT NULL,
	"league_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"status" "slate_status" DEFAULT 'draft'::"slate_status" NOT NULL,
	"published_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "slate_questions_slate_id_sort_order_idx" ON "slate_questions" ("slate_id","sort_order");--> statement-breakpoint
ALTER TABLE "slate_questions" ADD CONSTRAINT "slate_questions_slate_id_slates_id_fkey" FOREIGN KEY ("slate_id") REFERENCES "slates"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "slate_questions" ADD CONSTRAINT "slate_questions_question_id_questions_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "slates" ADD CONSTRAINT "slates_sport_id_sports_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "slates" ADD CONSTRAINT "slates_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "slates" ADD CONSTRAINT "slates_season_id_seasons_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "slates" ADD CONSTRAINT "slates_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;