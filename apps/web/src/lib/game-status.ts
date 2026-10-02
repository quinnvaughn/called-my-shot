import { DateTime } from "luxon"
import { match } from "ts-pattern"
import type { GameStatus, LeagueWindowType } from "#/graphql/generated/graphql"

type StatusGame = {
	status: GameStatus
	startsAt: string
	homeScore: number | null
	awayScore: number | null
	// startsAt is a placeholder date with no real time yet - a postseason game
	// ESPN hasn't scheduled. Absent where a query doesn't ask for it.
	startTimeTbd?: boolean
}

// Shared by GameBlock (the compact inline matchup badge) and GameRow (the
// league Games tab's fuller row) so a game's status/score never gets
// formatted two different ways in two places.
export function gameScoreLabel(game: StatusGame): string {
	return `${game.awayScore ?? "-"}–${game.homeScore ?? "-"}`
}

export function gameStartLabel(game: StatusGame): string {
	const date = DateTime.fromISO(game.startsAt)
	return game.startTimeTbd
		? `${date.toFormat("MMM d")}, time TBD`
		: date.toFormat("MMM d, h:mm a")
}

// Time only, no date - for a context that already tells you the date some
// other way (e.g. GameRow's window stepper header), where repeating "Aug 26"
// on every row below it would just be noise.
export function gameTimeLabel(game: StatusGame): string {
	return game.startTimeTbd
		? "TBD"
		: DateTime.fromISO(game.startsAt).toFormat("h:mm a")
}

export function gameStatusLabel(game: StatusGame): string {
	return match(game.status)
		.with("FINAL", () => `FINAL · ${gameScoreLabel(game)}`)
		.with("LIVE", () => `LIVE · ${gameScoreLabel(game)}`)
		.with("SCHEDULED", () => gameStartLabel(game))
		.exhaustive()
}

// Phrased in the league's own scheduling unit (see leagues.windowType): "this
// week" for a league whose slate is a week (NFL), "today" for one browsed a
// day at a time (NBA/MLB). Counting a week's games but calling them today's
// would read as broken on an NFL Tuesday, when the week has 16 games and the
// day has none.
export function windowUnitLabel(windowType: LeagueWindowType): string {
	return match(windowType)
		.with("WEEK", () => "this week")
		.with("DATE", () => "today")
		.exhaustive()
}

// Shared by the league room's header and Home's LeagueRoomCard - no "live"
// count folded in here, that data isn't reliable enough yet to surface.
export function gamesInWindowLabel(
	count: number,
	windowType: LeagueWindowType,
): string {
	const unit = windowUnitLabel(windowType)
	return count === 0
		? `No games ${unit}`
		: `${count} game${count === 1 ? "" : "s"} ${unit}`
}

// "W-L" for the overwhelming majority of sports, "W-L-T" only once a team
// actually has a tie on the board (MLB/NBA never will; NFL occasionally
// does) - showing "-0" on every row regardless would just be noise for the
// sports that never see one. The NHL's "W-L-OTL" always carries its third
// count, zero included, since that's how hockey records are written;
// otLosses is null for every other league. Null in, null out:
// GameRef.homeTeamRecord/awayTeamRecord are null for a game synced before
// that data existed.
export function formatTeamRecord(
	record: {
		wins: number
		losses: number
		ties: number
		otLosses?: number | null
	} | null,
): string | null {
	if (!record) return null
	const base = `${record.wins}-${record.losses}`
	if (record.otLosses != null) return `${base}-${record.otLosses}`
	return record.ties > 0 ? `${base}-${record.ties}` : base
}
