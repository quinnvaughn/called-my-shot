import { eq } from "drizzle-orm"
import { isMainModule } from "../../lib/is-main-module"
import { db } from "../index"
import { games } from "../schema"
import { type EspnEvent, fetchSchedule } from "./espn-client"
import { SYNCED_LEAGUES } from "./leagues"
import { resolveGameWinner, toGameStatus } from "./sync-games"
import { findSourceId } from "./sync-refs"

// How far back/forward from "now" a game counts as "plausibly in flight" -
// wide enough to catch a game that started a while ago and is still going
// (extra innings/overtime) plus one about to start, without scanning a
// whole season's worth of games the way sync:sports does. This is the thing
// that makes this job cheap enough to run every couple of minutes, unlike
// sync:sports's full team/season/player/game/question sweep.
const LOOKBACK_MS = 6 * 60 * 60 * 1000
const LOOKAHEAD_MS = 10 * 60 * 1000

export async function syncLiveScores(): Promise<void> {
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

if (isMainModule(import.meta.url)) {
	syncLiveScores()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error(err)
			process.exit(1)
		})
}
