import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	lt,
	or,
	sql,
} from "drizzle-orm"
import { db } from "../../db"
import {
	games,
	type League,
	leagues,
	type Team,
	teams,
	type User,
	users,
	type WatchQuiz,
	type WatchQuizAttempt,
	watchQuizAttempts,
	watchQuizzes,
} from "../../db/schema"
import { addArcadeDays, arcadeDayStart } from "../arcade/day"
import { DAY_MS } from "../time"
import { watchLeague } from "./leagues"
import { evaluateWatchAttempt, type WatchState, watchRunCode } from "./play"

export type LoadedWatchQuiz = WatchQuiz & {
	league: League
	team: Team
	opponent: Team
}

const withTeams = { league: true, team: true, opponent: true } as const

// A team by its link: the league's slug and the team's abbreviation,
// lowercased, the same rule as the web's teamSlug.
export async function findTeamBySlugs(
	leagueSlug: string,
	teamSlug: string,
): Promise<(Team & { league: League }) | null> {
	const [row] = await db
		.select({ team: teams, league: leagues })
		.from(teams)
		.innerJoin(leagues, eq(leagues.id, teams.leagueId))
		.where(
			and(
				eq(leagues.slug, leagueSlug.toLowerCase()),
				sql`lower(${teams.abbreviation}) = ${teamSlug.toLowerCase()}`,
			),
		)
		.limit(1)
	return row ? { ...row.team, league: row.league } : null
}

export async function findWatchQuiz(
	id: string,
): Promise<LoadedWatchQuiz | null> {
	return (
		(await db.query.watchQuizzes.findFirst({
			where: { id },
			with: withTeams,
		})) ?? null
	)
}

// The team's newest quiz, whether or not it's gone stale.
export async function findCurrentWatchQuiz(
	teamId: string,
): Promise<LoadedWatchQuiz | null> {
	return (
		(await db.query.watchQuizzes.findFirst({
			where: { teamId },
			orderBy: { gameStartsAt: "desc" },
			with: withTeams,
		})) ?? null
	)
}

export async function findWatchQuizByCode(
	teamId: string,
	code: string,
): Promise<LoadedWatchQuiz | null> {
	return (
		(await db.query.watchQuizzes.findFirst({
			where: { teamId, code },
			with: withTeams,
		})) ?? null
	)
}

// The newest quiz of each of these teams.
export async function loadCurrentWatchQuizzes(
	teamIds: string[],
): Promise<Map<string, LoadedWatchQuiz>> {
	if (teamIds.length === 0) return new Map()
	const latest = await db
		.selectDistinctOn([watchQuizzes.teamId], { id: watchQuizzes.id })
		.from(watchQuizzes)
		.where(inArray(watchQuizzes.teamId, teamIds))
		.orderBy(watchQuizzes.teamId, desc(watchQuizzes.gameStartsAt))
	if (latest.length === 0) return new Map()
	const rows = await db.query.watchQuizzes.findMany({
		where: { id: { in: latest.map((r) => r.id) } },
		with: withTeams,
	})
	return new Map(rows.map((quiz) => [quiz.teamId, quiz]))
}

// The team's latest final game with a box score in, the one its quiz
// should be on.
export async function latestBoxScoreGame(teamId: string) {
	const [game] = await db
		.select()
		.from(games)
		.where(
			and(
				or(eq(games.homeTeamId, teamId), eq(games.awayTeamId, teamId)),
				eq(games.status, "final"),
				isNotNull(games.boxScoreSyncedAt),
			),
		)
		.orderBy(desc(games.startsAt))
		.limit(1)
	return game ?? null
}

export function watchQuizFresh(quiz: LoadedWatchQuiz, now: Date): boolean {
	const staleDays = watchLeague(quiz.league.slug)?.staleDays ?? 0
	return quiz.gameStartsAt.getTime() > now.getTime() - staleDays * DAY_MS
}

// Up to be played: the team's newest quiz, and not gone stale.
export async function watchQuizLive(
	quiz: LoadedWatchQuiz,
	now: Date,
): Promise<boolean> {
	if (!watchQuizFresh(quiz, now)) return false
	const current = await findCurrentWatchQuiz(quiz.teamId)
	return current?.id === quiz.id
}

export async function findWatchAttempt(quizId: string, userId: string) {
	return (
		(await db.query.watchQuizAttempts.findFirst({
			where: { quizId, userId },
		})) ?? null
	)
}

export type WatchPlayView = {
	quiz: LoadedWatchQuiz
	state: WatchState
	clean: boolean
	// Kept on an account, so it has a place on the board.
	saved: boolean
	finished: boolean
	now: Date
}

export function watchPlayView(
	quiz: LoadedWatchQuiz,
	attempt: Pick<
		WatchQuizAttempt,
		"answers" | "openServedAt" | "clean" | "finishedAt"
	>,
	{ live, now, saved = true }: { live: boolean; now: Date; saved?: boolean },
): WatchPlayView {
	const state = evaluateWatchAttempt(attempt, quiz.questions.length, now, {
		live,
	})
	return {
		quiz,
		state,
		clean: attempt.clean,
		saved,
		finished: !!attempt.finishedAt || state.answers.length >= state.total,
		now,
	}
}

// The order the board ranks finished runs in.
const boardOrder = [
	desc(watchQuizAttempts.correctCount),
	asc(watchQuizAttempts.totalMs),
	asc(watchQuizAttempts.finishedAt),
]

export type WatchBoardEntry = {
	rank: number
	user: User
	correctCount: number
	totalMs: number
	clean: boolean
}

export async function loadWatchBoard(
	quiz: WatchQuiz,
	first: number,
): Promise<WatchBoardEntry[]> {
	const rows = await db
		.select({ attempt: watchQuizAttempts, user: users })
		.from(watchQuizAttempts)
		.innerJoin(users, eq(users.id, watchQuizAttempts.userId))
		.where(
			and(
				eq(watchQuizAttempts.quizId, quiz.id),
				isNotNull(watchQuizAttempts.finishedAt),
			),
		)
		.orderBy(...boardOrder)
		.limit(first)
	return rows.map((row, i) => ({
		rank: i + 1,
		user: row.user,
		correctCount: row.attempt.correctCount,
		totalMs: row.attempt.totalMs,
		clean: row.attempt.clean,
	}))
}

// Finished runs ahead of this one on the board, plus one.
export async function watchBoardRank(
	attempt: WatchQuizAttempt,
): Promise<number> {
	const [row] = await db
		.select({ ahead: sql<number>`count(*)::int` })
		.from(watchQuizAttempts)
		.where(
			and(
				eq(watchQuizAttempts.quizId, attempt.quizId),
				isNotNull(watchQuizAttempts.finishedAt),
				sql`(${watchQuizAttempts.correctCount}, -${watchQuizAttempts.totalMs}) > (${attempt.correctCount}, ${-attempt.totalMs})`,
			),
		)
	return (row?.ahead ?? 0) + 1
}

export async function countWatchPlayers(quizId: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(watchQuizAttempts)
		.where(
			and(
				eq(watchQuizAttempts.quizId, quizId),
				isNotNull(watchQuizAttempts.finishedAt),
			),
		)
	return row?.count ?? 0
}

// Runs from `userIds` finished between two days, inclusive, by when they
// finished, with the quiz each was on.
export async function loadWatchResultsBetween(
	fromDay: string,
	toDay: string,
	userIds: string[],
) {
	if (userIds.length === 0) return []
	return db
		.select({
			attempt: watchQuizAttempts,
			quizId: watchQuizzes.id,
			teamId: watchQuizzes.teamId,
			total: sql<number>`jsonb_array_length(${watchQuizzes.questions})::int`,
		})
		.from(watchQuizAttempts)
		.innerJoin(watchQuizzes, eq(watchQuizzes.id, watchQuizAttempts.quizId))
		.where(
			and(
				inArray(watchQuizAttempts.userId, userIds),
				gte(watchQuizAttempts.finishedAt, arcadeDayStart(fromDay)),
				lt(
					watchQuizAttempts.finishedAt,
					arcadeDayStart(addArcadeDays(toDay, 1)),
				),
			),
		)
}

// The player a shared link names (its ?by=), only when their own finished
// run on the quiz has the link's result.
export async function verifiedWatchSharer(
	quiz: WatchQuiz,
	username: string,
	code: string,
) {
	const user = await db.query.users.findFirst({ where: { username } })
	if (!user) return null
	const attempt = await findWatchAttempt(quiz.id, user.id)
	if (!attempt?.finishedAt) return null
	const own = watchRunCode({
		correctCount: attempt.correctCount,
		total: quiz.questions.length,
		totalMs: attempt.totalMs,
		clean: attempt.clean,
	})
	return own === code.toLowerCase() ? user : null
}

// The columns that follow from a run's state: its answers, tally, open
// question, and when it finished if it just did.
export function attemptValues(
	attempt: Pick<WatchQuizAttempt, "finishedAt">,
	state: WatchState,
	now: Date,
) {
	return {
		answers: state.answers,
		openServedAt: state.openServedAt,
		correctCount: state.correctCount,
		totalMs: state.totalMs,
		finishedAt:
			attempt.finishedAt ?? (state.answers.length >= state.total ? now : null),
	}
}

// Writes down a question that timed out while nobody was looking, so a
// run whose last question ran out still finishes and makes the board.
export async function settleWatchAttempt(
	quiz: LoadedWatchQuiz,
	attempt: WatchQuizAttempt,
	{ live, now }: { live: boolean; now: Date },
): Promise<WatchQuizAttempt> {
	const state = evaluateWatchAttempt(attempt, quiz.questions.length, now, {
		live,
	})
	if (state.answers.length === attempt.answers.length) return attempt
	const [saved] = await db
		.update(watchQuizAttempts)
		.set(attemptValues(attempt, state, now))
		.where(eq(watchQuizAttempts.id, attempt.id))
		.returning()
	return saved ?? attempt
}
