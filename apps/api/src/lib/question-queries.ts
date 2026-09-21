import {
	count,
	eq,
	ilike,
	inArray,
	isNotNull,
	isNull,
	notExists,
	or,
	type SQL,
	sql,
} from "drizzle-orm"
import type { PgSelect } from "drizzle-orm/pg-core"
import { match } from "ts-pattern"
import { db } from "../db"
import {
	ballotQuestions,
	calls,
	players,
	type Question,
	questions,
	teams,
	users,
} from "../db/schema"

type QuestionStatus = Question["status"]
type QuestionShape = Question["shape"]

// Settled for good: a call on one of these has its final outcome.
export const SETTLED_STATUSES = [
	"resolved",
	"voided",
] as const satisfies QuestionStatus[]

// Still waiting on a result.
export const UNRESOLVED_STATUSES = [
	"open",
	"locked",
] as const satisfies QuestionStatus[]

// Already decided one way or another, disputes included - nothing left to act
// on.
export const DECIDED_STATUSES = [
	"resolved",
	"disputed",
	"voided",
] as const satisfies QuestionStatus[]

// The standalone season award races.
export const SEASON_AWARD_SHAPES = [
	"player_season_award",
	"team_season_award",
	"player_award_finalists",
] as const satisfies QuestionShape[]

// Live call count per question, joined in rather than counted per row so a
// most-called sort can ORDER BY it in SQL.
export function callCountsCte(name = "call_counts") {
	return db.$with(name).as(
		db
			.select({
				questionId: calls.questionId,
				cnt: count(calls.id).as("cnt"),
			})
			.from(calls)
			.groupBy(calls.questionId),
	)
}

// A question's call count off callCountsCte, zero for one nobody has called.
export function callCountOf(cte: ReturnType<typeof callCountsCte>) {
	return sql`coalesce(${cte.cnt}, 0)`
}

// The rows questionSearch reaches beyond the question itself: its asker, and
// its subject team or player. Left joins, so a question without one still
// matches on the rest. Expects questions to already be in the query.
export function joinQuestionPeople<T extends PgSelect>(
	query: T,
	reach: { creator: boolean } = { creator: true },
) {
	const withCreator = reach.creator
		? query.leftJoin(users, eq(users.id, questions.creatorId))
		: query
	return withCreator
		.leftJoin(teams, eq(teams.id, questions.subjectTeamId))
		.leftJoin(players, eq(players.id, questions.subjectPlayerId))
}

// Free-text search over a question's title and, where the query joined them
// in (see joinQuestionPeople), its asker's name and its subject's.
export function questionSearch(
	search: string | null | undefined,
	reach: { creator: boolean; subjects: boolean },
): SQL | undefined {
	if (!search) return undefined
	const pattern = `%${search}%`
	return or(
		ilike(questions.title, pattern),
		...(reach.creator
			? [ilike(users.name, pattern), ilike(users.username, pattern)]
			: []),
		...(reach.subjects
			? [
					ilike(teams.name, pattern),
					ilike(teams.abbreviation, pattern),
					ilike(players.name, pattern),
				]
			: []),
	)
}

// The filters every question list shares. Each is skipped when unset.
export function questionFilters(filters: {
	leagueId?: string | null
	status?: QuestionStatus | null
	shapes?: readonly QuestionShape[] | null
	// Game questions only, or season-long ones (no game behind them) only.
	scope?: "game" | "season_long" | null
}): (SQL | undefined)[] {
	return [
		filters.leagueId ? eq(questions.leagueId, filters.leagueId) : undefined,
		filters.status ? eq(questions.status, filters.status) : undefined,
		filters.shapes && filters.shapes.length > 0
			? inArray(questions.shape, [...filters.shapes])
			: undefined,
		match(filters.scope)
			.with("game", () => isNotNull(questions.gameId))
			.with("season_long", () => isNull(questions.gameId))
			.otherwise(() => undefined),
	]
}

// A question that doesn't belong to any ballot.
export function notInABallot(): SQL {
	return notExists(
		db
			.select({ one: sql`1` })
			.from(ballotQuestions)
			.where(eq(ballotQuestions.questionId, questions.id)),
	)
}
