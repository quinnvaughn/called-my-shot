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
