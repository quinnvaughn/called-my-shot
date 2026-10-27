// A Teammate Chain result everywhere it's shown: the link that shares it,
// what that link's code says, and the dare.

// "3-1-0-94" (links, misses, hints, seconds) or "x-2-1" (misses, hints) for
// a game given up, as the API hands it back. `by` is the signed-in player's
// username, so the page the link opens can say whose result it is once the
// API has checked it.
export function chainResultPath(
	date: string,
	resultCode: string,
	by?: string | null,
): string {
	const path = `/arcade/teammate-chain/${date}/${resultCode}`
	return by ? `${path}?by=${encodeURIComponent(by)}` : path
}

export type ChainResultCode =
	| {
			solved: true
			links: number
			misses: number
			hints: number
			seconds: number
	  }
	| { solved: false; misses: number; hints: number }

// The result a share link's code describes, or null when no game could have
// it. The API checks the same rules.
export function parseChainResultCode(code: string): ChainResultCode | null {
	const gaveUp = code.match(/^x-(\d{1,3})-(\d{1,3})$/)
	if (gaveUp) {
		return {
			solved: false,
			misses: Number(gaveUp[1]),
			hints: Number(gaveUp[2]),
		}
	}
	const solved = code.match(/^(\d)-(\d{1,3})-(\d{1,3})-(\d{1,6})$/)
	if (!solved) return null
	const links = Number(solved[1])
	if (links < 2 || links > 6) return null
	return {
		solved: true,
		links,
		misses: Number(solved[2]),
		hints: Number(solved[3]),
		seconds: Number(solved[4]),
	}
}

// "1985-2003", "2019".
export function chainPlayerYears(player: {
	firstSeason?: number | null
	lastSeason?: number | null
}): string | null {
	const { firstSeason, lastSeason } = player
	if (!firstSeason || !lastSeason) return null
	return firstSeason === lastSeason
		? String(firstSeason)
		: `${firstSeason}-${lastSeason}`
}

export function sharePercent(share: number): number {
	return Math.round(share * 100)
}

type Rarity = {
	solvers: number
	sameRoute: number
	players: { share: number; player: { player: { name: string } } }[]
}

// The player in a route the fewest other solvers went through.
export function rarestPlayer(rarity: Rarity) {
	return rarity.players.reduce<Rarity["players"][number] | null>(
		(rarest, p) => (!rarest || p.share < rarest.share ? p : rarest),
		null,
	)
}

// Below this share, a player in the route is worth calling out in the dare.
const RARE_SHARE = 0.25

// The question the share panel puts to the player's friends. A route few
// others found leads, since finding a different way is half the game.
export function chainShareDare({
	links,
	par,
	rarity,
}: {
	links: number | null
	par: number
	rarity: Rarity | null
}): string {
	if (links === null) return "Can your friends connect them?"
	const rarest = rarity ? rarestPlayer(rarity) : null
	if (rarity && rarity.solvers > 1 && rarity.sameRoute === 1) {
		return "Nobody else took your route. Can your friends find one shorter?"
	}
	if (rarest && rarity && rarity.solvers > 1 && rarest.share < RARE_SHARE) {
		return `Only ${sharePercent(rarest.share)}% went through ${rarest.player.player.name}. Can your friends find their own route?`
	}
	if (links <= par) return "Can your friends match par?"
	return `Can your friends do it in fewer than ${links} links?`
}
