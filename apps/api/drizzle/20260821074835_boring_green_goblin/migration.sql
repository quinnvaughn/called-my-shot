CREATE TYPE "sync_entity_type" AS ENUM('team', 'player', 'game');--> statement-breakpoint
CREATE TYPE "sync_source" AS ENUM('espn');--> statement-breakpoint
CREATE TABLE "external_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source" "sync_source" NOT NULL,
	"entity_type" "sync_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"source_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "external_refs_source_entity_type_source_id_unique" UNIQUE("source","entity_type","source_id"),
	CONSTRAINT "external_refs_source_entity_type_entity_id_unique" UNIQUE("source","entity_type","entity_id")
);
