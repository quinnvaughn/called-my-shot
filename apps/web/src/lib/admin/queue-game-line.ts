import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import { DateTime } from "luxon"
import { match } from "ts-pattern"
import type { GameStatus } from "#/graphql/generated/graphql"
import { MONTH_DAY_TIME_FORMAT } from "#/lib/format-date"
import { matchupLabel } from "#/lib/game-status"

type QueueLineGame = {
	startsAt: string
	status: GameStatus
	awayScore: number | null
	homeScore: number | null
	league: { abbreviation: string }
	awayTeam: { abbreviation: string }
	homeTeam: { abbreviation: string }
}

// A question title like "Who will win?" names nothing on its own, so each row
// says which game it belongs to, when it started, and where it stands.
export function queueGameLine(
	game: QueueLineGame | null | undefined,
): string | null {
	if (!game) return null
	const when = DateTime.fromISO(game.startsAt, { zone: SPORTS_TIME_ZONE })
		.setLocale("en-US")
		.toFormat(MONTH_DAY_TIME_FORMAT)
	const state = match(game.status)
		.with("FINAL", () =>
			game.awayScore != null && game.homeScore != null
				? `Final ${game.awayScore}-${game.homeScore}`
				: "Final",
		)
		.with("LIVE", () => "Live")
		.with("SCHEDULED", () => "Not started")
		.exhaustive()
	return `${game.league.abbreviation.toUpperCase()} · ${matchupLabel(game)} · ${when} ET · ${state}`
}
