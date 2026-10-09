// Where one user's filled-out ballot lives. There's no entry id: the ballot
// slug and the username are the whole address.
export function ballotEntryPath(ballotSlug: string, username: string): string {
	return `/ballots/${ballotSlug}/${username}`
}

export function formatRecord(wins: number, losses: number): string {
	return `${wins}–${losses}`
}

export function formatSignedPoints(points: number): string {
	return `${points >= 0 ? "+" : "−"}${Math.abs(points)}`
}

// A win-totals ballot can be read as projected standings as well as a list
// of picks. The ballot page is where picks get made, so it opens on its
// questions and ?view=standings switches. An entry page is someone's ballot
// to look at, so it opens on standings and ?view=picks switches. Any other
// ballot has only the list, and ignores the param.
//
// An entry page opened from a group's ballot board also carries ?group=, so
// its breadcrumb leads back to that board.
export type BallotPageSearch = { view?: "standings" }
export type BallotEntrySearch = { view?: "picks"; group?: string }

export function validateBallotPageSearch(
	search: Record<string, unknown>,
): BallotPageSearch {
	return search.view === "standings" ? { view: "standings" } : {}
}

export function validateBallotEntrySearch(
	search: Record<string, unknown>,
): BallotEntrySearch {
	return {
		...(search.view === "picks" ? { view: "picks" as const } : {}),
		...(typeof search.group === "string" ? { group: search.group } : {}),
	}
}
