import { match, P } from "ts-pattern"
import { formatRecord, matchupLabel } from "#/lib/game-status"
import { pluralize } from "#/lib/pluralize"

type SlateGame = {
	awayTeam: { abbreviation: string }
	homeTeam: { abbreviation: string }
}

export type SweepProgressInput = {
	status: "ALIVE" | "OFF" | "SWEPT"
	gameCount: number
	calledCount: number
	winCount: number
	lossCount: number
	missedGames: SlateGame[]
	lostGames: SlateGame[]
}

const MAX_NAMED_GAMES = 2

// "BUF @ MIA", "BUF @ MIA and NYJ @ NE", "BUF @ MIA, NYJ @ NE and 3 more".
function nameGames(games: SlateGame[]): string {
	const named = games.slice(0, MAX_NAMED_GAMES).map((g) => matchupLabel(g))
	const rest = games.length - named.length
	if (rest > 0) return `${named.join(", ")} and ${rest} more`
	return named.join(" and ")
}

// The one line a slate header says about the viewer's sweep of it. A sweep
// is every winner in the slate called right, so the line tracks exactly that:
// how many are still uncalled while nothing has settled, the record once
// something has, and which game ended it once one did.
export function slateSweepText(p: SweepProgressInput): string {
	return match(p)
		.with({ status: "SWEPT" }, ({ gameCount: n }) => `Swept. ${n} for ${n}.`)
		.with(
			{ status: "OFF", missedGames: P.when((games) => games.length > 0) },
			({ missedGames }) =>
				`Sweep is off. You didn't call ${nameGames(missedGames)}.`,
		)
		.with(
			{ status: "OFF", lostGames: P.when((games) => games.length > 0) },
			({ lostGames }) =>
				`Sweep is off. ${nameGames(lostGames)} went the other way.`,
		)
		.with({ status: "OFF" }, () => "Sweep is off.")
		.with({ status: "ALIVE" }, (alive) => {
			const n = alive.gameCount
			if (alive.winCount + alive.lossCount === 0) {
				return `${alive.calledCount} of ${n} winners called. Call all ${n} for a sweep.`
			}
			const record = `${formatRecord(alive.winCount, alive.lossCount)} so far, ${n - alive.winCount} to go.`
			const uncalled = n - alive.calledCount
			return uncalled > 0
				? `${record} ${uncalled} still ${pluralize(uncalled, "needs", "need")} your pick.`
				: record
		})
		.exhaustive()
}
