import { DateTime } from "luxon"
import { match } from "ts-pattern"
import type { GameStatus } from "#/graphql/generated/graphql"

type StatusGame = {
	status: GameStatus
	startsAt: string
	homeScore: number | null
	awayScore: number | null
}

// Shared by GameBlock (the compact inline matchup badge) and GameRow (the
// league Games tab's fuller row) so a game's status/score never gets
// formatted two different ways in two places.
export function gameScoreLabel(game: StatusGame): string {
	return `${game.awayScore ?? "-"}–${game.homeScore ?? "-"}`
}

export function gameStartLabel(game: StatusGame): string {
	return DateTime.fromISO(game.startsAt).toFormat("MMM d, h:mm a")
}

// Time only, no date - for a context that already tells you the date some
// other way (e.g. GameRow's window stepper header), where repeating "Aug 26"
// on every row below it would just be noise.
export function gameTimeLabel(game: StatusGame): string {
	return DateTime.fromISO(game.startsAt).toFormat("h:mm a")
}

export function gameStatusLabel(game: StatusGame): string {
	return match(game.status)
		.with("FINAL", () => `FINAL · ${gameScoreLabel(game)}`)
		.with("LIVE", () => `LIVE · ${gameScoreLabel(game)}`)
		.with("SCHEDULED", () => gameStartLabel(game))
		.exhaustive()
}
