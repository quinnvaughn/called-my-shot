import { earlyTierFor, seasonEarlyTierFor } from "@called-my-shot/scoring"
import { match } from "ts-pattern"
import type { Game } from "../../db/schema"

// What earliness is measured against. A game-scoped question ranks its calls
// against every call on it; a season-long one measures how much of the
// season had been played when each call was made, over the games in the
// window the question was open for (see seasonEarlyTierFor). That window is
// bounded by the question's own locksAt rather than a fixed regular-season
// cutoff, so postseason games count exactly when the question stayed open
// into them.
export type EarlinessBasis =
	| { by: "rank"; totalCalls: number }
	| { by: "season"; games: Pick<Game, "startsAt" | "status">[] }

// Each call's earliness multiplier, keyed by call id. Earliness belongs to
// the call, not any one selection in it - an award call's picks all share
// one createdAt - so this takes distinct calls. Ties keep the order given.
export function earlinessFor(
	calls: { id: string; createdAt: Date }[],
	basis: EarlinessBasis,
): Map<string, number> {
	const ordered = [...calls].sort(
		(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
	)
	return match(basis)
		.with(
			{ by: "rank" },
			({ totalCalls }) =>
				new Map(
					ordered.map((c, index) => [
						c.id,
						earlyTierFor(index + 1, totalCalls).mult,
					]),
				),
		)
		.with(
			{ by: "season" },
			({ games }) =>
				new Map(
					ordered.map((c) => {
						const gamesPlayed = games.filter(
							(g) => g.status === "final" && g.startsAt <= c.createdAt,
						).length
						return [c.id, seasonEarlyTierFor(gamesPlayed, games.length).mult]
					}),
				),
		)
		.exhaustive()
}
