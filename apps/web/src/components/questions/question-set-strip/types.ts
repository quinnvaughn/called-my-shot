import type { BallotMemberState } from "#/lib/ballot-member-state"

export type QuestionSetMember = {
	key: string
	questionId: string
	questionTitle: string
	state: BallotMemberState
	// The chip's text in the grid.
	chipLabel: string
	// The prev/next box's text, and the chip's tooltip.
	navLabel: string
	// The small line above navLabel in a prev/next box.
	navKicker: string | null
	section: string | null
	// The viewer's points once the call has settled.
	points: number | null
	// The scorecard row's right-hand column while there are no points to show.
	listTrailing: string | null
	// What "next unanswered" names this member as.
	jumpLabel: string
}
