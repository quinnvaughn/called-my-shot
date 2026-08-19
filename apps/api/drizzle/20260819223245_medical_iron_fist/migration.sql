CREATE TYPE "support_category" AS ENUM('bug', 'feature_request', 'call_question', 'other');--> statement-breakpoint
CREATE TYPE "support_ticket_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"category" "support_category" NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"related_url" text,
	"status" "support_ticket_status" DEFAULT 'open'::"support_ticket_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;