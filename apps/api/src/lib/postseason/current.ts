import type { PostseasonSeries, Season } from "../../db/schema"
import { isGameConfirmed, type SeriesGame, standingBefore } from "./series"

export type SeasonPhase = "upcoming" | "regular_season" | "postseason" | "complete"

// Where a season stands at `now`, read off ESPN's calendar dates. The days
// between the regular season's last game and the postseason's start still
// count as regular season, since no playoff game is scheduled before
// postseasonStartsAt.
export function seasonPhase(
	season: Pick<
		Season,
		| "regularSeasonStartsAt"
		| "regularSeasonEndsAt"
		| "postseasonStartsAt"
		| "postseasonEndsAt"
	>,
	now: Date = new Date(),
): SeasonPhase {
	if (now < season.regularSeasonStartsAt) return "upcoming"
	if (now > (season.postseasonEndsAt ?? season.regularSeasonEndsAt)) {
		return "complete"
	}
	if (season.postseasonStartsAt && now >= season.postseasonStartsAt) {
		return "postseason"
	}
	return "regular_season"
}

export type RoundSeries = Pick<
	PostseasonSeries,
	"id" | "round" | "winnerTeamId" | "decidedAt"
> & {
	// The series' earliest game, null before any has synced.
	firstGameAt: Date | null
}

// A round that finished within this long of the latest decision still counts
// as current once nothing is left undecided, so an AL and NL round that
// wrapped a day apart both stay on the board until the next round syncs.
const RECENT_ROUND_MS = 2 * 24 * 60 * 60 * 1000

// The rounds a postseason is playing right now, as ESPN's round names, in the
// order each round first plays. A round is current while any of its series is
// undecided. Between rounds, before the next round's games have synced, the
// rounds decided most recently stand in, so there is still a round to show.
export function currentRounds(series: RoundSeries[]): string[] {
	const live = series.filter((s) => !s.winnerTeamId)
	const pool =
		live.length > 0 ? live : recentlyDecided(series.filter((s) => s.decidedAt))
	const firstAtByRound = new Map<string, number>()
	for (const s of pool) {
		const at = s.firstGameAt?.getTime() ?? Number.POSITIVE_INFINITY
		const known = firstAtByRound.get(s.round)
		if (known === undefined || at < known) firstAtByRound.set(s.round, at)
	}
	return [...firstAtByRound]
		.sort(([, a], [, b]) => a - b)
		.map(([round]) => round)
}

function recentlyDecided(decided: RoundSeries[]): RoundSeries[] {
	const latest = Math.max(
		...decided.map((s) => s.decidedAt?.getTime() ?? Number.NEGATIVE_INFINITY),
	)
	return decided.filter(
		(s) => latest - (s.decidedAt?.getTime() ?? 0) <= RECENT_ROUND_MS,
	)
}

// Whether a game still to be played decides its series for at least one side:
// an elimination game, or a winner-take-all one. A game the series may never
// reach doesn't count, matching the stakes tag the game's own row shows.
export function isEliminationGame(
	game: SeriesGame,
	seriesGames: SeriesGame[],
	bestOf: number | null,
): boolean {
	if (game.status === "final") return false
	if (!isGameConfirmed(game, seriesGames, bestOf)) return false
	return standingBefore(game, seriesGames, bestOf).clinchTeamIds.length > 0
}
