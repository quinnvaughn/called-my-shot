import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
import { games } from "./games"
import { leagues } from "./sports"
import { teams } from "./teams"
import { users } from "./users"

// One choice on a question. playerId is set when the choice is a player, for
// the headshot.
export type WatchOption = { label: string; playerId: string | null }

// One question as it was built from the box score. `answer` indexes
// `options`, and `reveal` is the line shown once it's answered ("Brown had
// 11."). Never sent to a player before they answer it.
export type WatchQuestion = {
	template: string
	prompt: string
	options: WatchOption[]
	answer: number
	reveal: string
}

// One answered question. `choice` is null when the clock ran out. `ms` is
// how long it took, capped at the question's clock, so a timeout counts the
// full clock.
export type WatchAnswer = {
	choice: number | null
	servedAt: string
	answeredAt: string | null
	ms: number
	correct: boolean
}

// One team's quiz on one of its games, built once the box score is in.
// Stored whole so a stat correction after someone has played can't change
// the quiz under them: a rebuild only replaces one nobody has started.
export const watchQuizzes = pgTable(
	"watch_quizzes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "cascade" }),
		teamId: uuid("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		opponentTeamId: uuid("opponent_team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		gameId: uuid("game_id")
			.notNull()
			.references(() => games.id, { onDelete: "cascade" }),
		// The game's day in the sports time zone, "2026-10-26", with "-2" on
		// the second game of a doubleheader. What a link to this quiz names.
		code: text("code").notNull(),
		// games.startsAt, copied, for which quiz is a team's latest and
		// whether it's gone stale.
		gameStartsAt: timestamp("game_starts_at").notNull(),
		questions: jsonb("questions").$type<WatchQuestion[]>().notNull(),
		// The box score this was built from. A newer sync of a quiz nobody has
		// started rebuilds it.
		boxScoreSyncedAt: timestamp("box_score_synced_at").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		unique().on(t.teamId, t.gameId),
		unique().on(t.teamId, t.code),
		index("watch_quizzes_team_starts_idx").on(t.teamId, t.gameStartsAt.desc()),
	],
)
export type WatchQuiz = typeof watchQuizzes.$inferSelect

// One player's run through a quiz. Questions are served one at a time:
// openServedAt is when the one after `answers` was shown, and null between
// questions. correctCount and totalMs are written with each answer so the
// board is a sort over rows.
export const watchQuizAttempts = pgTable(
	"watch_quiz_attempts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		quizId: uuid("quiz_id")
			.notNull()
			.references(() => watchQuizzes.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		answers: jsonb("answers").$type<WatchAnswer[]>().notNull().default([]),
		openServedAt: timestamp("open_served_at"),
		startedAt: timestamp("started_at").notNull().defaultNow(),
		finishedAt: timestamp("finished_at"),
		correctCount: integer("correct_count").notNull().default(0),
		totalMs: integer("total_ms").notNull().default(0),
		// Stayed on the page through every question.
		clean: boolean("clean").notNull().default(true),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		unique().on(t.quizId, t.userId),
		index("watch_quiz_attempts_board_idx").on(
			t.quizId,
			t.correctCount.desc(),
			t.totalMs,
		),
		index("watch_quiz_attempts_user_idx").on(t.userId),
	],
)
export type WatchQuizAttempt = typeof watchQuizAttempts.$inferSelect
