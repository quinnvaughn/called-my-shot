// The one pick on a post the fewest other people made, said as the reason
// to send it: "Only 6% of people put Dirk Nowitzki on theirs." It leads the
// author's share panel, their posted text and the post's link preview.
//
// Null while the prompt has too few public answers for a share to mean
// anything (one answer is 100% everything), and when even the rarest pick is
// one most people made, since "Only 70%" is no reason to argue.

const MIN_ANSWERS = 10
const MAX_SHARE = 25

function rarest<T extends { sharePercent: number }>(
	picks: readonly T[],
	answerCount: number,
): T | null {
	if (answerCount < MIN_ANSWERS) return null
	let found: T | null = null
	for (const pick of picks) {
		if (!found || pick.sharePercent < found.sharePercent) found = pick
	}
	return found && found.sharePercent <= MAX_SHARE ? found : null
}

// sharePercent is rounded, so a lone pick among hundreds reads 0.
const only = (percent: number) =>
	percent < 1 ? "Fewer than 1%" : `Only ${percent}%`

export function rushmoreHook(
	picks: readonly { sharePercent: number; player: { name: string } }[],
	answerCount: number,
): string | null {
	const pick = rarest(picks, answerCount)
	if (!pick) return null
	return `${only(pick.sharePercent)} of people put ${pick.player.name} on theirs.`
}

export function redraftHook(
	picks: readonly {
		slot: number
		sharePercent: number
		player: { name: string }
	}[],
	answerCount: number,
): string | null {
	const pick = rarest(picks, answerCount)
	if (!pick) return null
	return `${only(pick.sharePercent)} take ${pick.player.name} at No. ${pick.slot}.`
}
