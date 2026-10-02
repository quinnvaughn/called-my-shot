import type { ChampionshipKey } from "@called-my-shot/schemas"
import type { EspnPostseasonEvent } from "../../db/sync/espn-client"

// The headline ESPN puts on every game of the round that decides each
// championship. A series round is decided by the game that completes the
// series; the NFL's rounds are single games.
const DECIDING_ROUND: Record<ChampionshipKey, RegExp> = {
	"nba:NBA Finals": /^NBA Finals\b/,
	"nba:Conference Finals:East": /^East Finals\b/,
	"nba:Conference Finals:West": /^West Finals\b/,
	"nfl:Super Bowl": /^Super Bowl\b/,
	"nfl:Championship:AFC": /^AFC Championship$/,
	"nfl:Championship:NFC": /^NFC Championship$/,
	"mlb:World Series": /^World Series\b/,
	"mlb:Pennant:AL": /^ALCS\b/,
	"mlb:Pennant:NL": /^NLCS\b/,
	"nhl:Stanley Cup": /^Stanley Cup Final\b/,
	"nhl:Conference Final:East": /^East Final\b/,
	"nhl:Conference Final:West": /^West Final\b/,
}

export type ChampionshipWinner = { espnEventId: string; espnTeamId: string }

// The team that won a championship, from a league's postseason scoreboard, or
// null while ESPN doesn't show the deciding round as finished.
export function findChampionshipWinner(
	key: ChampionshipKey,
	events: EspnPostseasonEvent[],
): ChampionshipWinner | null {
	const round = DECIDING_ROUND[key]
	const deciding = events
		.map((event) => ({ event, competition: event.competitions[0] }))
		.filter(
			({ competition }) =>
				competition.notes?.some(
					(note) => note.headline !== undefined && round.test(note.headline),
				) &&
				competition.status.type.completed &&
				(competition.series?.completed ?? true),
		)
	const last = deciding[deciding.length - 1]
	const winner = last?.competition.competitors.find((c) => c.winner)
	return last && winner
		? { espnEventId: last.event.id, espnTeamId: winner.team.id }
		: null
}
