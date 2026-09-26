CREATE TYPE "gloat_message" AS ENUM('told_you', 'wrong_call', 'think_twice', 'called_it', 'faded_and_cashed', 'wrong_side', 'check_the_receipt');--> statement-breakpoint
ALTER TABLE "call_fades" ADD COLUMN "fader_gloat_message" "gloat_message";--> statement-breakpoint
ALTER TABLE "call_fades" ADD COLUMN "target_gloat_message" "gloat_message";