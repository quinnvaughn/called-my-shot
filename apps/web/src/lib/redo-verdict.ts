export type RedoPanelData = {
	// Both ISO timestamps, rendered through CallTimestamp.
	originalCalledAt: string
	redoneAt: string
	// What the call used to say, formatted the same way the live pick is (see
	// pickSummary), so the two read as the same kind of thing.
	originalPickLabel: string
	currentPickLabel: string
	originalCaseText: string | null
	// Null until the question resolves. Whether the pick they walked away
	// from would have been the right one.
	originalWasCorrect: boolean | null
	currentIsWin: boolean | null
}

// What the redo actually cost or saved, once the question has settled. The
// first case is the whole reason the original pick is kept and shown at all.
export function redoVerdict(data: RedoPanelData): string | null {
	if (data.originalWasCorrect === null || data.currentIsWin === null) {
		return null
	}
	if (data.originalWasCorrect && !data.currentIsWin) {
		return "Should have stuck with it."
	}
	if (!data.originalWasCorrect && data.currentIsWin) {
		return "Saved by the redo."
	}
	if (data.originalWasCorrect && data.currentIsWin) {
		return "Right either way."
	}
	return "Wrong either way."
}
