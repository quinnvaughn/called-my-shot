import { BallotSetRailFragment } from "#/components/ballots/ballot-set-rail"
import { GameSetRailFragment } from "#/components/games/game-set-rail"
// A plain unwrap of a masked fragment, not a React hook - see #/lib/identity.
import { useFragment as unmask } from "#/graphql/generated"
import { ballotMemberState } from "#/lib/ballot-member-state"
import { gameSetRailLabel } from "#/lib/game-set-rail"
import { officialQuestionSequence } from "#/lib/official-game-questions"
import { questionSetNavigation } from "#/lib/question-set-navigation"
import type { QuestionDetail } from "./types"

export type QuestionSetStop = {
	questionId: string
	questionTitle: string
	// What the rail calls it ("Tatum PTS", "MVP").
	label: string
}

export type QuestionSetPosition = {
	// -1 when the question on screen isn't one of the set's (a community
	// question on a game): there's no prev or next then, only the jump.
	currentIndex: number
	count: number
	prev: QuestionSetStop | null
	next: QuestionSetStop | null
	nextUncalled: QuestionSetStop | null
}

// Where the question on screen sits in its set, read off the same data and
// in the same order as the rail beside it (GameSetRail, BallotSetRail): a
// game's official questions in the game page's order, or a ballot's members
// in the ballot's. Null for a question on neither.
export function questionSetPosition(
	question: QuestionDetail,
): QuestionSetPosition | null {
	const stops = questionSetStops(question)
	if (!stops || stops.length === 0) return null
	const currentIndex = stops.findIndex((s) => s.questionId === question.id)
	const nav = questionSetNavigation(
		stops.map((s) => s.state),
		currentIndex,
	)
	const at = (index: number | null) =>
		index === null ? null : (stops[index] ?? null)
	return {
		currentIndex,
		count: stops.length,
		prev: at(nav.prevIndex),
		next: at(nav.nextIndex),
		nextUncalled: at(nav.nextUncalledIndex),
	}
}

function questionSetStops(question: QuestionDetail) {
	// Ballot members are season-long questions, so a question is on one set
	// or the other, never both.
	const ballot = unmask(BallotSetRailFragment, question).ballotMembership
		?.ballot
	if (ballot) {
		return ballot.members.map(({ label, question: member }) => ({
			questionId: member.id,
			questionTitle: member.title,
			label,
			state: ballotMemberState(member, member.viewerCall),
		}))
	}
	if (!question.game) return null
	const official = unmask(GameSetRailFragment, question.game.officialQuestions)
	return officialQuestionSequence([...official]).map(
		({ question: member }) => ({
			questionId: member.id,
			questionTitle: member.title,
			label: gameSetRailLabel(member),
			state: ballotMemberState(member, member.viewerCall),
		}),
	)
}
