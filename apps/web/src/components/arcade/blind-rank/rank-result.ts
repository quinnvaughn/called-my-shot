// What a Blind Rank result looks like everywhere it's drawn: five squares,
// one per slot from the top, and the link that shares them.

export const RANK_SLOTS = 5

// Whether each slot was right, top first, from a finished game's slots.
export function rankSquares(
	slots: readonly { correct?: boolean | null }[],
): boolean[] {
	return slots.map((s) => s.correct === true)
}

// The squares as a share link carries them: g for a right slot, r otherwise.
export function rankSquaresCode(squares: readonly boolean[]): string {
	return squares.map((right) => (right ? "g" : "r")).join("")
}

// The squares a share link's code describes, or null when no finished game
// could have them (four right can't happen).
export function parseRankSquaresCode(code: string): boolean[] | null {
	const lower = code.toLowerCase()
	if (!/^[gr]{5}$/.test(lower)) return null
	const squares = [...lower].map((c) => c === "g")
	return squares.filter(Boolean).length === RANK_SLOTS - 1 ? null : squares
}

// `by` is the signed-in player's username, so the page the link opens can
// say whose result it is (once the API has checked it's really theirs).
export function rankResultPath(
	date: string,
	squares: readonly boolean[],
	by?: string | null,
): string {
	const path = `/arcade/blind-rank/${date}/${rankSquaresCode(squares)}`
	return by ? `${path}?by=${encodeURIComponent(by)}` : path
}
