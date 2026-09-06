import {
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"

export const syncSource = pgEnum("sync_source", ["espn"])

export const syncEntityType = pgEnum("sync_entity_type", [
	"team",
	"player",
	"game",
])

// Bookkeeping for the ESPN sync only - maps a row in teams/players/games to
// the id an external source uses for it, so re-syncing updates the existing
// row instead of creating a duplicate. entityId has no FK: which table it
// points into depends on entityType, so it's deliberately polymorphic.
// Nothing in teams/players/games itself knows this table exists - dropping
// it entirely (e.g. switching data sources) doesn't touch domain data at all.
export const externalRefs = pgTable(
	"external_refs",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		source: syncSource("source").notNull(),
		entityType: syncEntityType("entity_type").notNull(),
		entityId: uuid("entity_id").notNull(),
		sourceId: text("source_id").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.source, t.entityType, t.sourceId),
		unique().on(t.source, t.entityType, t.entityId),
	],
)
export type ExternalRef = typeof externalRefs.$inferSelect
