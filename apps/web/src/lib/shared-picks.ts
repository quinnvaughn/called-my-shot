// What two Rushmores of the same prompt have in common, said plainly under
// someone else's: "You both have Curry and Paul." Surnames, since the faces
// above already carry the full names.

const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"])

export function surname(name: string): string {
	const words = name.trim().split(/\s+/)
	while (words.length > 1 && SUFFIXES.has((words.at(-1) ?? "").toLowerCase())) {
		words.pop()
	}
	return words.at(-1) ?? name
}

function listWithAnd(items: string[]): string {
	return items.length <= 1
		? (items[0] ?? "")
		: `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
}

export function sharedPicksLine(
	theirs: { id: string; name: string }[],
	mine: { id: string }[],
): string {
	const mineIds = new Set(mine.map((player) => player.id))
	const shared = theirs.filter((player) => mineIds.has(player.id))
	if (shared.length === 0) return "None of your four are on this one."
	if (shared.length === theirs.length) return "Same four as yours."
	return `You both have ${listWithAnd(shared.map((player) => surname(player.name)))}.`
}
