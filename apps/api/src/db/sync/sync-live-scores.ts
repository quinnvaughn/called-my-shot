import { eq } from "drizzle-orm"
import { SYNC_LIVE_SCORES_LOCK } from "../../lib/job-lock"
import { settleSeries } from "../../lib/postseason/settle"
import { runCli } from "../../lib/run-cli"
import { HOUR_MS, MINUTE_MS } from "../../lib/time"
import { db } from "../index"
import { games } from "../schema"
import {
	defaultEspnClient,
	type EspnClient,
	type EspnScoreboardEvent,
} from "./espn-client"
import { SYNCED_LEAGUES } from "./leagues"
import {
	finalizedAtFor,
	isAtHalftime,
	resolveGameWinner,
	toGameStatus,
} from "./sync-games"
import { espnIdOf, findSourceId } from "./sync-refs"

// How far back/forward from "now" a game counts as "plausibly in flight" -
// wide enough to catch a game that started a while ago and is still going
// (extra innings/overtime) plus one about to start, without scanning a
// whole season's worth of games the way sync:sports does. This is the thing
// that makes this job cheap enough to run every couple of minutes, unlike
// sync:sports's full team/season/player/game/question sweep.
export const LOOKBACK_MS = 6 * HOUR_MS
const LOOKAHEAD_MS = 10 * MINUTE_MS

// Returns the games this run moved to final, so the caller can settle their
// questions straight away.
export async function syncLiveScores({
	now = new Date(),
	espn = defaultEspnClient,
}: {
	now?: Date
	espn?: EspnClient
} = {}): Promise<string[]> {
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
		return []
	}

	// One scoreboard call per league covers every candidate game in that
	// league at once. Not fetchSchedule (the daily full sync's source, see
	// sync-games.ts) - that endpoint's score field is only ever populated
	// once a game goes final, never while it's actually in progress (verified
	// live), which is exactly why a live game sat at "LIVE ---" forever. The
	// scoreboard endpoint is ESPN's real live feed instead.
	const scoreboardCache = new Map<string, EspnScoreboardEvent[]>()
	const wentFinal: string[] = []

	for (const game of candidates) {
		const league = game.league
		if (!league) continue
		const config = SYNCED_LEAGUES.find((c) => c.leagueSlug === league.slug)
		if (!config) continue

		const isNewlyFinal = await db.transaction(async (tx) => {
			let scoreboard = scoreboardCache.get(config.espnPath)
			if (!scoreboard) {
				scoreboard = await espn.fetchScoreboard(config.espnPath)
				scoreboardCache.set(config.espnPath, scoreboard)
			}

			const gameSourceId = await findSourceId(tx, "game", game.id)
			const espnEventId = gameSourceId ? espnIdOf(gameSourceId) : undefined
			const event = scoreboard.find((e) => e.id === espnEventId)
			if (!event) return false

			const competition = event.competitions[0]
			const [home, away] = competition.competitors
			const status = toGameStatus(competition.status)
			const homeScore =
				home.score !== undefined ? Math.round(Number(home.score)) : null
			const awayScore =
				away.score !== undefined ? Math.round(Number(away.score)) : null

			await tx
				.update(games)
				.set({
					status,
					atHalftime: isAtHalftime(competition.status),
					homeScore,
					awayScore,
					finalizedAt: finalizedAtFor(status),
				})
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
				// A series game going final can end the series, which settles its
				// series questions and drops the games it no longer needs.
				if (game.seriesId) await settleSeries(tx, game.seriesId, now)
			}
			return status === "final" && game.status !== "final"
		})
		if (isNewlyFinal) wentFinal.push(game.id)
	}

	return wentFinal
}

runCli(import.meta.url, syncLiveScores, { lock: SYNC_LIVE_SCORES_LOCK })
