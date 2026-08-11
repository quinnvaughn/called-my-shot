CREATE TYPE "numeric_subject_type" AS ENUM('player', 'team');--> statement-breakpoint
CREATE TYPE "question_category" AS ENUM('season_awards', 'game_stats', 'player_stats', 'other');--> statement-breakpoint
CREATE TYPE "question_status" AS ENUM('open', 'locked', 'resolved');--> statement-breakpoint
CREATE TYPE "question_type" AS ENUM('multiple_choice', 'yes_no', 'over_under', 'numeric_guess', 'multi_select');--> statement-breakpoint
CREATE TYPE "resolution_source" AS ENUM('espn', 'nba', 'league', 'other');--> statement-breakpoint
CREATE TABLE "call_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"call_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"conviction" integer NOT NULL,
	"field_pct_at_call" numeric(5,2) NOT NULL,
	"result_points" integer,
	CONSTRAINT "call_selections_call_id_option_id_unique" UNIQUE("call_id","option_id")
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"question_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"case_text" text,
	"guess_value" numeric(8,2),
	"conviction" integer,
	"hit_tolerance" boolean,
	"result_points" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calls_question_id_user_id_unique" UNIQUE("question_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"question_id" uuid NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_correct" boolean
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"type" "question_type" NOT NULL,
	"category" "question_category" NOT NULL,
	"title" text NOT NULL,
	"creator_id" uuid NOT NULL,
	"is_official" boolean DEFAULT false NOT NULL,
	"resolution_source" "resolution_source" NOT NULL,
	"other_source_url" text,
	"locks_at" timestamp NOT NULL,
	"status" "question_status" DEFAULT 'open'::"question_status" NOT NULL,
	"resolved_at" timestamp,
	"resolution_note" text,
	"ou_stat" text,
	"ou_line" numeric(8,2),
	"numeric_stat" text,
	"numeric_subject_type" "numeric_subject_type",
	"numeric_subject_name" text,
	"numeric_tolerance_pct" numeric(4,3),
	"numeric_actual_value" numeric(8,2),
	"picks_required" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_selections" ADD CONSTRAINT "call_selections_call_id_calls_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "call_selections" ADD CONSTRAINT "call_selections_option_id_question_options_id_fkey" FOREIGN KEY ("option_id") REFERENCES "question_options"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_question_id_questions_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_questions_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_creator_id_users_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE;