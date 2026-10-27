// Where a Were You Watching? quiz and its results live. The result code
// itself is shared with the API (watchResultCode in @called-my-shot/schemas).

// "/arcade/were-you-watching/nba/bos", a team's quiz.
export const watchTeamPath = (leagueSlug: string, teamSlug: string) =>
	`/arcade/were-you-watching/${leagueSlug}/${teamSlug}`

// `by` is the signed-in player's username, so the page the link opens can
// say whose result it is once the API has checked it.
export function watchResultPath(
	leagueSlug: string,
	teamSlug: string,
	quizCode: string,
	resultCode: string,
	by?: string | null,
): string {
	const path = `${watchTeamPath(leagueSlug, teamSlug)}/${quizCode}/${resultCode}`
	return by ? `${path}?by=${encodeURIComponent(by)}` : path
}

// "Oct 26", the game's day.
export function watchGameDay(gameStartsAt: string): string {
	return new Date(gameStartsAt).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "America/New_York",
	})
}
