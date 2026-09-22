import { ballotMemberState } from "./ballot-member-state"

// Where one user's picks on a game's official questions live. The game id and
// the username are the whole address, same as a ballot entry.
export function gameEntryPath(gameId: string, username: string): string {
	return `/games/${gameId}/picks/${username}`
}

type SummaryQuestion = Parameters<typeof ballotMemberState>[0] & {
	viewerCall:
		| (NonNullable<Parameters<typeof ballotMemberState>[1]> & {
				totalPoints: number | null
		  })
		| null
}

// The viewer's own tally on a game's official questions, for the share text
// on the game page and the game strip. Counted from the same member states
// the strip draws, so the tweet and the dots can't disagree.
export function viewerGamePicksSummary(questions: SummaryQuestion[]) {
	const states = questions.map((q) => ballotMemberState(q, q.viewerCall))
	return {
		calledCount: questions.filter((q) => q.viewerCall !== null).length,
		questionCount: questions.length,
		wins: states.filter((s) => s === "won").length,
		losses: states.filter((s) => s === "lost").length,
		points: questions.reduce(
			(sum, q) => sum + (q.viewerCall?.totalPoints ?? 0),
			0,
		),
	}
}
