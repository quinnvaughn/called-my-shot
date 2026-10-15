import { DateTime } from "luxon"
import { match } from "ts-pattern"
import type { GameStatus, LeagueWindowType } from "#/graphql/generated/graphql"
import { MONTH_DAY_TIME_FORMAT } from "./format-date"
import { pluralize } from "./pluralize"
import { seriesStakesLabel } from "./postseason"

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
		: date.toFormat(MONTH_DAY_TIME_FORMAT)
}

// Time only, no date - for a context that already tells you the date some
// other way (e.g. GameRow's window stepper header), where repeating "Aug 26"
// on every row below it would just be noise.
export function gameTimeLabel(game: StatusGame): string {
	return game.startTimeTbd
		? "TBD"
		: DateTime.fromISO(game.startsAt).toFormat("h:mm a")
}

// How often a page showing a game in play re-reads it, so the score and the
// live numbers beside it move without a reload. The numbers themselves
// refresh every five minutes server side (sync-live-readings), so this only
// has to keep up.
export const IN_PLAY_REFETCH_MS = 60_000

// Being played, or past its start with the last read still saying scheduled:
// the status only flips when sync-live-scores next runs, and the page has to
// be polling already to see it.
export function isGameInPlay(game: {
	status: GameStatus
	startsAt: string
}): boolean {
	return (
		game.status === "LIVE" ||
		(game.status === "SCHEDULED" && Date.parse(game.startsAt) <= Date.now())
	)
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
		: `${count} ${pluralize(count, "game")} ${unit}`
}

// "BOS @ NYY": away team first, the way a schedule writes a game.
export function matchupLabel(game: {
	awayTeam: { abbreviation: string }
	homeTeam: { abbreviation: string }
}): string {
	return `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`
}

// "12–4", or "12–4–1" with a third count. A tie or a draw is written only
// once there is one, so pass it as `ties || null`: showing "–0" on every row
// would be noise for the sports that never see one. The NHL's overtime losses
// are passed even at zero, since that's how hockey records are written.
export function formatRecord(
	wins: number,
	losses: number,
	third?: number | null,
): string {
	return third == null ? `${wins}–${losses}` : `${wins}–${losses}–${third}`
}

// "Game 5, winner take all. Series tied 2-2." ahead of a series game's meta
// description, so a shared link says what's riding on it. Null outside a
// series.
export function seriesLead(game: {
	status: string
	postseason?: {
		gameNumber: number | null
		ifNecessary: boolean
		summary: string | null
		clinchTeamIds: string[]
	} | null
}): string | null {
	const postseason = game.postseason
	if (!postseason?.gameNumber) return null
	const stakes =
		game.status !== "FINAL" && !postseason.ifNecessary
			? seriesStakesLabel(postseason)
			: null
	const qualifier = stakes
		? stakes.toLowerCase()
		: postseason.ifNecessary
			? "if necessary"
			: null
	const first = qualifier
		? `Game ${postseason.gameNumber}, ${qualifier}.`
		: `Game ${postseason.gameNumber}.`
	return postseason.summary ? `${first} ${postseason.summary}.` : first
}
