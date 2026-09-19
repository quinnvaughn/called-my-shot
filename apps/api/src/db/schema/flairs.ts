import {
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
import { groups } from "./groups"
import { teams } from "./teams"
import { users } from "./users"

// Where a flair came from, which is what the picker groups by and what its
// copy says. Deliberately NOT the same axis as `unlock` below: a bought flair
// and an earned one can share a rule while reading as completely different
// things. "group" and "purchase" have no rows yet - they're in the enum from
// the start because adding a value later is another migration, and an unused
// one costs nothing.
export const flairSource = pgEnum("flair_source", [
	"team",
	"achievement",
	"group",
	"purchase",
])

// Whether equipping this needs a userFlairs row. "open" is equippable by
// anyone it's in scope for, with nothing written anywhere - that's every team
// flair, and it's what lets a brand new account pick one on signup day. "grant"
// needs the row.
//
// One column covers three futures: an achievement granted by the streak
// pipeline, a group flair an admin assigns rather than lets members pick, and
// a purchase whose checkout writes the row. None of them add a branch beyond
// the two here.
export const flairUnlock = pgEnum("flair_unlock", ["open", "grant"])

// "retired" hides a flair from every picker without deleting a row that users
// and grants still point at. Anyone who already equipped it keeps rendering
// it, which is the point: pulling a flair off people who earned it is worse
// than letting a retired one live on.
export const flairStatus = pgEnum("flair_status", ["active", "retired"])

export const flairs = pgTable(
	"flairs",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// The stable name the catalog sync and the grant writer address a flair
		// by, so neither depends on a uuid that differs between dev, test and
		// prod. Renaming one makes the sync create a second flair beside the
		// first rather than update it, the same trap GameQuestionTemplate.id
		// carries.
		//
		// Null for a group-authored flair: nothing addresses those by name, they
		// only ever get looked up by id. Postgres lets nulls repeat under a
		// unique index, so this stays unique for the flairs that do have one.
		key: text("key").unique(),
		source: flairSource("source").notNull(),
		unlock: flairUnlock("unlock").notNull(),
		status: flairStatus("status").notNull().default("active"),
		// Null means site-wide. Set means the flair only exists inside that one
		// group: its members are the only people who can equip it, and it only
		// renders on that group's surfaces.
		//
		// Nothing writes this yet. It's here from the first migration because
		// per-group flair is a known next step, and retrofitting a scope onto a
		// table that already has live rows and live pointers is the migration
		// worth not doing twice.
		scopeGroupId: uuid("scope_group_id").references(() => groups.id, {
			onDelete: "cascade",
		}),
		// Who authored a group flair. Null on everything the catalog syncs.
		// Reserved alongside scopeGroupId above.
		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		// Set iff source is "team". The unique below is what stops a team
		// collecting two flairs; it only constrains team flairs, since every
		// other source leaves this null and nulls repeat.
		teamId: uuid("team_id").references(() => teams.id, {
			onDelete: "cascade",
		}),
		// All three are null on a team flair, and read live off the team row
		// instead. db/sync/sync-teams.ts rewrites a team's name, abbreviation
		// and color on every run, so a copy here would quietly go stale the
		// first time a team rebrands or ESPN corrects a color. Same "trust the
		// upstream source, don't duplicate it" call as teamRecords in ./teams.
		icon: text("icon"),
		label: text("label"),
		color: text("color"),
		// The one line under a flair in the picker, naming the mechanic that
		// unlocks it ("Ten straight correct calls in one league and family").
		// Null on a team flair, which explains itself.
		description: text("description"),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.teamId),
		index("flairs_scope_idx").on(t.scopeGroupId, t.source, t.sortOrder),
	],
)
export type Flair = typeof flairs.$inferSelect
