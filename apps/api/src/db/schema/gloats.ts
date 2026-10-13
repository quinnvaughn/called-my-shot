import { sql } from "drizzle-orm"
import {
	check,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
import { challengeAcceptances, challenges } from "./challenges"
import { presserReportReason, presserReportStatus } from "./pressers"
import { users } from "./users"

// What a gloat was sent over. challenge_creator fans out to every acceptor
// the creator beat; challenge_acceptor goes to the creator from one acceptor
// who beat them.
export const gloatSource = pgEnum("gloat_source", [
	"challenge_creator",
	"challenge_acceptor",
])
export type GloatSource = (typeof gloatSource.enumValues)[number]

export const gifProvider = pgEnum("gif_provider", ["klipy"])

// Something a winner says to whoever they beat: their own words, a GIF, or
// both. One per sender per thing it was sent over, and never edited -
// removedAt is an admin taking it down off a report, and the content stays
// for the report's record.
export const gloats = pgTable(
	"gloats",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		senderId: uuid("sender_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		source: gloatSource("source").notNull(),
		challengeId: uuid("challenge_id")
			.notNull()
			.references(() => challenges.id, { onDelete: "cascade" }),
		// The 1v1 an acceptor's gloat is about. Null on the creator's, which
		// covers every acceptor they beat.
		acceptanceId: uuid("acceptance_id").references(
			() => challengeAcceptances.id,
			{ onDelete: "cascade" },
		),
		text: text("text"),
		gifProvider: gifProvider("gif_provider"),
		gifId: text("gif_id"),
		gifUrl: text("gif_url"),
		gifWidth: integer("gif_width"),
		gifHeight: integer("gif_height"),
		gifAlt: text("gif_alt"),
		removedAt: timestamp("removed_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.challengeId, t.senderId, t.acceptanceId).nullsNotDistinct(),
		check(
			"gloats_has_content",
			sql`${t.text} is not null or ${t.gifUrl} is not null`,
		),
	],
)
export type Gloat = typeof gloats.$inferSelect

// A report on a gloat. Shares the presser report reasons and statuses: an
// admin acting on either can take the content down.
export const gloatReports = pgTable(
	"gloat_reports",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		reporterId: uuid("reporter_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		gloatId: uuid("gloat_id")
			.notNull()
			.references(() => gloats.id, { onDelete: "cascade" }),
		reason: presserReportReason("reason").notNull(),
		details: text("details"),
		status: presserReportStatus("status").notNull().default("open"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		reviewedAt: timestamp("reviewed_at"),
		reviewedByAdminId: uuid("reviewed_by_admin_id").references(() => users.id, {
			onDelete: "set null",
		}),
	},
	(t) => [
		unique().on(t.reporterId, t.gloatId),
		index("gloat_reports_status_idx").on(t.status, t.createdAt),
	],
)
export type GloatReport = typeof gloatReports.$inferSelect
