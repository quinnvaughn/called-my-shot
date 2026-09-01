import { and, eq } from "drizzle-orm"
import { resolveQuestionInternal } from "../../graphql/types/question"
import { db } from "../index"
import { games, questions } from "../schema"
import { type EspnEvent, fetchSchedule } from "./espn-client"
import { SYNCED_LEAGUES } from "./leagues"
import { toGameStatus } from "./sync-games"
import { findSourceId, type Tx } from "./sync-refs"

// How far back/forward from "now" a game counts as "plausibly in flight" -
// wide enough to catch a game that started a while ago and is still going
// (extra innings/overtime) plus one about to start, without scanning a
// whole season's worth of games the way sync:sports does. This is the thing
// that makes this job cheap enough to run every couple of minutes, unlike
// sync:sports's full team/season/player/game/question sweep.
const LOOKBACK_MS = 6 * 60 * 60 * 1000
const LOOKAHEAD_MS = 10 * 60 * 1000

// Resolves this game's team_vs_team ("who wins?") question off the final
// score it was just synced with - the whole reason this job exists to admins
// is so nobody has to do this by hand once ESPN calls it. Mirrors the
// eligibility checks resolveQuestion/adminResolveQuestion each do before
// calling resolveQuestionInternal (that function has none of its own by
// design - see its own comment) plus a row lock, since this can now run
// again on a game already marked final without excluding it from the next
// query (see the status filter below) - if a prior run's resolution attempt
// failed partway, this is what lets a later run pick it back up rather than
// leaving it stuck open forever.
async function resolveGameWinner(
	tx: Tx,
	gameId: string,
	homeTeamId: string,
	awayTeamId: string,
	homeScore: number | null,
	awayScore: number | null,
): Promise<void> {
	// A tie has no winning option to mark (team_vs_team has no tie option -
	// see sync-game-questions.ts) - leave it for manual resolution rather
	// than guessing. Rare (NFL only), but a real possibility.
	if (homeScore === null || awayScore === null || homeScore === awayScore) {
		return
	}

	const [question] = await tx
		.select()
		.from(questions)
		.where(
			and(eq(questions.gameId, gameId), eq(questions.shape, "team_vs_team")),
		)
		.for("update")
	// No question yet (outside syncGameQuestions' create window at the time,
	// or a game predating that sync), or already handled (resolved by an
	// admin by hand, or disputed) - never touch it once it's past "open"/
	// "locked", same as every other resolution path in this app.
	if (
		!question ||
		question.status === "resolved" ||
		question.status === "disputed"
	) {
		return
	}

	const options = await tx.query.questionOptions.findMany({
		where: { questionId: question.id },
	})
	const winningTeamId = homeScore > awayScore ? homeTeamId : awayTeamId
	const winningOption = options.find((o) => o.teamId === winningTeamId)
	if (!winningOption) {
		console.error(
			`[sync-live-scores] question ${question.id}: no option matches winning team ${winningTeamId} - skipping`,
		)
		return
	}

	await resolveQuestionInternal(tx, question, {
		correctOptionIds: [winningOption.id],
		resolutionNote: "Resolved automatically from ESPN's final score.",
	})
	console.log(`[sync-live-scores] resolved question ${question.id}`)
}

async function main() {
	const now = new Date()
	const candidates = await db.query.games.findMany({
		where: {
			// "final" stays in the window (not just scheduled/live) so a game
			// that just flipped final gets a chance at auto-resolution above
			// even after this same run's own write below takes it out of
			// scheduled/live - and so a prior run's failed resolution attempt
			// gets retried by the next one instead of being silently excluded
			// forever once status has already landed on "final".
			status: { in: ["scheduled", "live", "final"] },
			startsAt: {
				gte: new Date(now.getTime() - LOOKBACK_MS),
				lte: new Date(now.getTime() + LOOKAHEAD_MS),
			},
		},
		with: { league: true },
	})

	if (candidates.length === 0) {
		console.log("[sync-live-scores] nothing in flight")
		return
	}

	// One fetchSchedule call per home team covers every candidate game that
	// team is playing in this window - same response syncGames trusts, just
	// for a handful of teams instead of a whole league's roster.
	const scheduleCache = new Map<string, EspnEvent[]>()

	for (const game of candidates) {
		const league = game.league
		if (!league) continue
		const config = SYNCED_LEAGUES.find((c) => c.leagueSlug === league.slug)
		if (!config) continue

		await db.transaction(async (tx) => {
			const homeSourceId = await findSourceId(tx, "team", game.homeTeamId)
			const homeEspnId = homeSourceId?.split(":")[1]
			if (!homeEspnId) return

			let schedule = scheduleCache.get(homeSourceId)
			if (!schedule) {
				schedule = await fetchSchedule(config.espnPath, homeEspnId)
				scheduleCache.set(homeSourceId, schedule)
			}

			const gameSourceId = await findSourceId(tx, "game", game.id)
			const espnEventId = gameSourceId?.split(":")[1]
			const event = schedule?.find((e) => e.id === espnEventId)
			if (!event) return

			const competition = event.competitions[0]
			const [home, away] = competition.competitors
			const status = toGameStatus(competition.status)
			const homeScore = home.score ? Math.round(home.score.value) : null
			const awayScore = away.score ? Math.round(away.score.value) : null

			await tx
				.update(games)
				.set({ status, homeScore, awayScore })
				.where(eq(games.id, game.id))

			console.log(
				`[sync-live-scores] ${game.id}: ${status} ${awayScore ?? "-"}-${homeScore ?? "-"}`,
			)

			if (status === "final") {
				await resolveGameWinner(
					tx,
					game.id,
					game.homeTeamId,
					game.awayTeamId,
					homeScore,
					awayScore,
				)
			}
		})
	}
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err)
		process.exit(1)
	})
