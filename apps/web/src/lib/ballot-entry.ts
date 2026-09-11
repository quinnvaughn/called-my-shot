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
