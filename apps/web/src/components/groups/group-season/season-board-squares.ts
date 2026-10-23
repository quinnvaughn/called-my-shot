import type { SeasonOutcome } from "#/components/arcade/name-that-season/season-result"

export type SeasonBoardStatus = "SOLVED" | "MISSED" | "PLAYING" | "NOT_PLAYED"

export function seasonPuzzleBoardResult(
	status: SeasonBoardStatus,
	squares: readonly SeasonOutcome[],
): string {
	if (status === "SOLVED") {
		return squares.length === 1 ? "First guess" : `In ${squares.length}`
	}
	if (status === "MISSED") return "Missed"
	if (status === "PLAYING") return "Still playing"
	return "Not played yet"
}
