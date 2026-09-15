// A generated game stat leader question's favorite: the contender with the
// best per-game average in the stat across both teams (see the template's
// pick in db/catalog/game-question-catalog.ts). Stored on the question so
// ./leader-calibration can check how often the favorite actually led, which
// is what a leader question's loss rate is tuned from.
export type LeaderBasis = {
	favoritePlayerId: string
	favoriteMean: number
	// How many contenders with an average the favorite was picked from.
	contenders: number
}

// Null when nobody has an average above zero to be the favorite on.
export function favoriteOf(
	ranked: { playerId: string; mean: number | null }[],
): LeaderBasis | null {
	const averaged = ranked.flatMap((contender) =>
		contender.mean === null
			? []
			: [{ playerId: contender.playerId, mean: contender.mean }],
	)
	let best: (typeof averaged)[number] | null = null
	for (const contender of averaged) {
		if (!best || contender.mean > best.mean) best = contender
	}
	if (!best || best.mean <= 0) return null
	return {
		favoritePlayerId: best.playerId,
		favoriteMean: Math.round(best.mean * 1000) / 1000,
		contenders: averaged.length,
	}
}
