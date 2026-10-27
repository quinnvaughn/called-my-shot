import { and, eq, gte, isNotNull, sql } from "drizzle-orm"
import { db } from "../../db"
import {
	type Game,
	games,
	type WatchQuestion,
	watchQuizAttempts,
	watchQuizzes,
} from "../../db/schema"
import { arcadeDay } from "../arcade/day"
import { seededRandom } from "../game-questions/select-templates"
import { BUILD_WATCH_QUIZZES_LOCK } from "../job-lock"
import { runCli } from "../run-cli"
import { DAY_MS } from "../time"
import { loadWatchBox, type WatchSide } from "./box"
import {
	MAX_QUESTIONS,
	MIN_QUESTIONS,
	type WatchLeague,
	watchLeague,
} from "./leagues"
import {
	finalScore,
	type TemplateContext,
	type WatchTeamInfo,
} from "./templates/common"

// How far back the sweep looks for box scores to build from.
const SWEEP_DAYS = 3

// One team's questions on one game, the same every time for the same box
// score. The final score always closes it; null when the box score can't
// fill a quiz.
export function buildWatchQuestions(args: {
	gameId: string
	league: WatchLeague
	team: WatchSide
	opp: WatchSide
	teamInfo: WatchTeamInfo
	oppInfo: WatchTeamInfo
	statusDetail: string | null
}): WatchQuestion[] | null {
	const ctx: TemplateContext = {
		league: args.league.slug,
		team: args.team,
		opp: args.opp,
		teamInfo: args.teamInfo,
		oppInfo: args.oppInfo,
		statusDetail: args.statusDetail,
		rng: seededRandom(`watch:${args.gameId}:${args.team.teamId}`),
		chosen: [],
	}
	for (const template of args.league.templates) {
		if (template === finalScore) continue
		if (ctx.chosen.length >= MAX_QUESTIONS - 1) break
		const question = template(ctx)
		if (question) ctx.chosen.push(question)
	}
	const last = finalScore(ctx)
	if (!last || ctx.chosen.length + 1 < MIN_QUESTIONS) return null
	return [...ctx.chosen, last]
}

// "built" when it wrote the quiz, "kept" when someone had already started
// it, "skipped" when the box score couldn't fill one.
export async function buildWatchQuiz(
	game: Game,
	teamId: string,
): Promise<"built" | "kept" | "skipped"> {
	if (!game.boxScoreSyncedAt) return "skipped"
	const opponentTeamId =
		teamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId
	const [league, teamRows, sides] = await Promise.all([
		db.query.leagues.findFirst({ where: { id: game.leagueId } }),
		db.query.teams.findMany({
			where: { id: { in: [teamId, opponentTeamId] } },
		}),
		loadWatchBox(game.id),
	])
	const settings = league ? watchLeague(league.slug) : null
	const team = sides.get(teamId)
	const opp = sides.get(opponentTeamId)
	const teamInfo = teamRows.find((t) => t.id === teamId)
	const oppInfo = teamRows.find((t) => t.id === opponentTeamId)
	if (!settings || !team || !opp || !teamInfo || !oppInfo) return "skipped"

	const questions = buildWatchQuestions({
		gameId: game.id,
		league: settings,
		team,
		opp,
		teamInfo,
		oppInfo,
		statusDetail: game.statusDetail,
	})
	if (!questions) return "skipped"

	const day = arcadeDay(game.startsAt)
	const sameDay = await db.query.watchQuizzes.findFirst({
		where: { teamId, code: day },
	})
	const code = sameDay && sameDay.gameId !== game.id ? `${day}-2` : day

	const started = sql`exists (select 1 from ${watchQuizAttempts} where ${watchQuizAttempts.quizId} = ${watchQuizzes.id})`
	const [written] = await db
		.insert(watchQuizzes)
		.values({
			leagueId: game.leagueId,
			teamId,
			opponentTeamId,
			gameId: game.id,
			code,
			gameStartsAt: game.startsAt,
			questions,
			boxScoreSyncedAt: game.boxScoreSyncedAt,
		})
		.onConflictDoUpdate({
			target: [watchQuizzes.teamId, watchQuizzes.gameId],
			set: { questions, boxScoreSyncedAt: game.boxScoreSyncedAt },
			setWhere: sql`not ${started}`,
		})
		.returning({ id: watchQuizzes.id })
	return written ? "built" : "kept"
}

// Builds the quiz on each team's latest game whose box score came in
// lately, and rebuilds one whose box score was corrected since, as long as
// nobody has started it.
export async function buildWatchQuizzes({ now = new Date() } = {}) {
	const recent = await db
		.select()
		.from(games)
		.where(
			and(
				eq(games.status, "final"),
				isNotNull(games.boxScoreSyncedAt),
				gte(
					games.boxScoreSyncedAt,
					new Date(now.getTime() - SWEEP_DAYS * DAY_MS),
				),
			),
		)
	const latestByTeam = new Map<string, Game>()
	for (const game of recent) {
		for (const teamId of [game.homeTeamId, game.awayTeamId]) {
			const seen = latestByTeam.get(teamId)
			if (!seen || seen.startsAt < game.startsAt) latestByTeam.set(teamId, game)
		}
	}
	const existing = latestByTeam.size
		? await db.query.watchQuizzes.findMany({
				where: {
					gameId: {
						in: [...new Set([...latestByTeam.values()].map((g) => g.id))],
					},
				},
			})
		: []
	let built = 0
	for (const [teamId, game] of latestByTeam) {
		const quiz = existing.find(
			(q) => q.teamId === teamId && q.gameId === game.id,
		)
		const synced = game.boxScoreSyncedAt
		if (quiz && synced && quiz.boxScoreSyncedAt >= synced) continue
		if ((await buildWatchQuiz(game, teamId)) === "built") built += 1
	}
	return { built }
}

//   pnpm build:watch-quizzes
runCli(
	import.meta.url,
	async () => {
		const { built } = await buildWatchQuizzes()
		console.log(`Built ${built} Were You Watching? quizzes.`)
	},
	{ lock: BUILD_WATCH_QUIZZES_LOCK },
)
