import type { QuestionStatus } from "#/graphql/generated/graphql"
import type { BallotMemberState } from "#/lib/ballot-member-state"
import type { LiveStanding } from "#/lib/game-set-rail"

export type QuestionSetRailRow = {
	questionId: string
	questionTitle: string
	questionStatus: QuestionStatus
	locksAt: string
	// What the question is about, short enough for one line of the rail.
	label: string
	// The heading the row sits under. Null on a set with no sections.
	section: string | null
	state: BallotMemberState
	// The viewer's call: their pick as it reads in a sentence, and what it
	// scores. Null when they haven't called it.
	call: {
		pick: string
		totalPoints: number | null
		payout: { winLow: number; winHigh: number; lose: number } | null
	} | null
	// Where the pick stands mid-game, for a set that has one.
	live: LiveStanding | null
}

export type QuestionSetRailSummary = {
	calledCount: number
	questionCount: number
	wins: number
	losses: number
	points: number
}

// The viewer's tally over a set's rows, for the rail's summary and whatever
// share text the page builds from it. extraRows are calls made on top of the
// set (a game's community questions): they count toward the record and
// points but not toward how much of the set is called, since they aren't
// part of it.
export function questionSetRailSummary(
	rows: QuestionSetRailRow[],
	extraRows: QuestionSetRailRow[] = [],
): QuestionSetRailSummary {
	const all = [...rows, ...extraRows]
	return {
		calledCount: rows.filter((r) => r.call !== null).length,
		questionCount: rows.length,
		wins: all.filter((r) => r.state === "won").length,
		losses: all.filter((r) => r.state === "lost").length,
		points: all.reduce((sum, r) => sum + (r.call?.totalPoints ?? 0), 0),
	}
}
