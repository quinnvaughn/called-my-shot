ALTER TABLE "user_streaks" ADD COLUMN "current_cold_length" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD COLUMN "current_cold_start_call_id" uuid;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD COLUMN "current_cold_end_call_id" uuid;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD COLUMN "worst_cold_length" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD COLUMN "worst_cold_start_call_id" uuid;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD COLUMN "worst_cold_end_call_id" uuid;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD COLUMN "worst_cold_ended_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_current_cold_start_call_id_calls_id_fkey" FOREIGN KEY ("current_cold_start_call_id") REFERENCES "calls"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_current_cold_end_call_id_calls_id_fkey" FOREIGN KEY ("current_cold_end_call_id") REFERENCES "calls"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_worst_cold_start_call_id_calls_id_fkey" FOREIGN KEY ("worst_cold_start_call_id") REFERENCES "calls"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_worst_cold_end_call_id_calls_id_fkey" FOREIGN KEY ("worst_cold_end_call_id") REFERENCES "calls"("id") ON DELETE SET NULL;