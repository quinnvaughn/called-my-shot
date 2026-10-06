import {
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
import { calls } from "./calls"
import { questions } from "./questions"
import { leagues, seasons, sports } from "./sports"
import { users } from "./users"

// draft: fully editable, invisible everywhere public - the questions inside
// it are still fully live/callable on their own (question creation itself
// has no draft state in this app), only the ballot GROUPING is hidden until
// an admin is happy with the member set. published: the grouping shows up
// on every member's detail page and feed card. No further states - a ballot
// doesn't resolve, its members do, individually, same as always.
export const ballotStatus = pgEnum("ballot_status", ["draft", "published"])

// A named bundle of independently-resolving questions (a Gold Glove race's
// 9 positions, a week of NFL games) - pure navigation/discovery grouping,
// not a new resolution mechanism. Every member keeps its own detail page,
// lock time, and resolution exactly as an unbundled question would.
// Admin-only to create or populate (see requireAdmin in every ballot
// resolver) - mirrors how award-shape questions are already forced official.
export const ballots = pgTable(
	"ballots",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		// What the public ballot page is addressed by
		// ("mlb-2026-al-gold-gloves") - a shared ballot link is the most
		// pasted url in the app, and a uuid in a group chat says nothing.
		// Globally unique rather than unique per (league, season): the league
		// and season are already baked into the string by
		// lib/ballot-slug.ts, so a flat constraint costs nothing and keeps the
		// route a single lookup. Never rewritten after insert, renames
		// included (see renameBallot) - a live shared link changing out from
		// under people is worse than a slug that no longer matches the name.
		slug: text("slug").notNull().unique(),
		// Derived server-side from the picked league at creation time, never
		// asked of the admin directly (leagues already carry their own sportId) -
		// same "don't ask for what's derivable" reasoning as questions.sportId
		// alongside questions.leagueId.
		sportId: uuid("sport_id")
			.notNull()
			.references(() => sports.id, { onDelete: "restrict" }),
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "restrict" }),
		// Server-derived via getCurrentSeason at creation time, same pattern as
		// questions.seasonId - never client-supplied.
		seasonId: uuid("season_id")
			.notNull()
			.references(() => seasons.id, { onDelete: "restrict" }),
		status: ballotStatus("status").notNull().default("draft"),
		publishedAt: timestamp("published_at"),
		// Nullable + set null on delete: deleting the admin who created a ballot
		// shouldn't take the ballot (and its members) down with it - same
		// reasoning as groups.createdBy.
		createdBy: uuid("created_by").references(() => users.id, {
			onDelete: "set null",
		}),
		// Display position among the ballots of one (league, season) - the pair
		// is the only scope a position means anything in, since that's all a
		// league room's Season tab ever shows at once. Every list that renders
		// ballots orders on this with name as the tiebreak, so the default of 1
		// leaves an untouched set reading exactly as alphabetical did.
		// Auto-generated ballots get theirs from the recurring catalog's own
		// group order (lib/season-questions.ts), hand-made ones append to the
		// end, and reorderBallots is the only thing that rewrites them after.
		sortOrder: integer("sort_order").notNull().default(1),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		index("ballots_league_id_season_id_sort_order_idx").on(
			t.leagueId,
			t.seasonId,
			t.sortOrder,
		),
	],
)
export type Ballot = typeof ballots.$inferSelect

// One row per question that's been placed into a ballot. questionId is
// UNIQUE on its own (not composite with ballotId) - a question belongs to at
// most one ballot at a time, which is what lets a member's prev/next nav and
// "which ballot is this part of" both be unambiguous. Removing a row here
// never deletes the question itself (see removeQuestionFromBallot) - same
// "unlink != delete" precedent as groupMembers.
export const ballotQuestions = pgTable(
	"ballot_questions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		ballotId: uuid("ballot_id")
			.notNull()
			.references(() => ballots.id, { onDelete: "cascade" }),
		questionId: uuid("question_id")
			.notNull()
			.references(() => questions.id, { onDelete: "cascade" }),
		// The nav-critical field - what actually renders in the member list and
		// prev/next nav. Required: an unlabeled member is unusable, unlike slot
		// below which plenty of real ballots (a week of games) have no use for.
		label: text("label").notNull(),
		// Optional short badge (e.g. "1B") - meaningless for non-positional
		// ballots, so nothing here depends on it being set.
		slot: text("slot"),
		// Optional heading for a run of consecutive members ("AFC · East" on a
		// win-totals ballot) - purely a display grouping, exactly like slot is
		// purely a display badge. Membership stays one flat list ordered by
		// sortOrder; every renderer draws a header only where this value
		// differs from the previous member's, so an ungrouped ballot (every
		// row null, which is most of them) looks exactly as it always has.
		// Nothing keeps same-section members adjacent - a hand reorder that
		// interleaves two sections just repeats the header, which is the
		// honest rendering of the order an admin actually chose.
		section: text("section"),
		// Position within the ballot - new members append to the end
		// (max(sortOrder)+1), reordering happens explicitly in the admin
		// builder (reorderBallotQuestions), never inferred from anything else.
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.questionId),
		index("ballot_questions_ballot_id_sort_order_idx").on(
			t.ballotId,
			t.sortOrder,
		),
	],
)
export type BallotQuestion = typeof ballotQuestions.$inferSelect

// One user's order for teams they gave the same win total on a win-totals
// ballot - the projected standings view's tiebreaker, since a single wins
// number can't feed a league's real ones (head-to-head, division record).
// Display only: nothing scores off this, which is why it stays out of calls.
// position is only ever compared among members currently tied in one
// conference, so a row left behind by a pick that has since changed is inert
// rather than wrong.
export const ballotTiebreaks = pgTable(
	"ballot_tiebreaks",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		ballotId: uuid("ballot_id")
			.notNull()
			.references(() => ballots.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		questionId: uuid("question_id")
			.notNull()
			.references(() => questions.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [unique().on(t.ballotId, t.userId, t.questionId)],
)
export type BallotTiebreak = typeof ballotTiebreaks.$inferSelect

// One row per pick a Rebalance moved: a win-totals ballot whose picks add up
// to more (or fewer) wins than the schedule hands out can be brought back
// toward it, one direction only (rebalanceWinTotals). The call itself holds
// the new number; this keeps what it said before, so the change stays on
// the record.
export const callRebalances = pgTable(
	"call_rebalances",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		callId: uuid("call_id")
			.notNull()
			.references(() => calls.id, { onDelete: "cascade" }),
		ballotId: uuid("ballot_id")
			.notNull()
			.references(() => ballots.id, { onDelete: "cascade" }),
		fromGuessValue: numeric("from_guess_value", {
			precision: 8,
			scale: 3,
			mode: "number",
		}).notNull(),
		toGuessValue: numeric("to_guess_value", {
			precision: 8,
			scale: 3,
			mode: "number",
		}).notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [index("call_rebalances_call_id_idx").on(t.callId)],
)
export type CallRebalance = typeof callRebalances.$inferSelect
