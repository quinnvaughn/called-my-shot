// A plain unwrap of a masked fragment, not a React hook - see #/lib/identity.
import {
	type FragmentType,
	graphql,
	useFragment as unmask,
} from "#/graphql/generated"
import { ballotMemberState } from "#/lib/ballot-member-state"
import { officialQuestionSequence } from "#/lib/official-game-questions"
import { questionSetNavigation } from "#/lib/question-set-navigation"

export const GameNextUpFragment = graphql(`
	fragment GameNextUp_question on Question {
		id
		game {
			id
			officialQuestions {
				id
				title
				shape
				createdAt
				status
				locksAt
				viewerCall {
					id
					hitTolerance
					selections {
						id
						option {
							id
							isCorrect
						}
					}
				}
			}
		}
	}
`)

export type GameNextUp = {
	next: { questionId: string; title: string }
}

// Where the viewer goes after calling this question: the next official
// question on the same game they haven't called, in the game page's order,
// wrapping back to any they skipped. Null for a question with no game or
// once nothing on it is left open.
export function gameNextUp(
	questionRef: FragmentType<typeof GameNextUpFragment> | null | undefined,
): GameNextUp | null {
	const question = unmask(GameNextUpFragment, questionRef)
	const game = question?.game
	if (!question || !game) return null

	const sequence = officialQuestionSequence(game.officialQuestions).map(
		(e) => e.question,
	)
	const { nextUncalledIndex } = questionSetNavigation(
		sequence.map((q) => ballotMemberState(q, q.viewerCall)),
		sequence.findIndex((q) => q.id === question.id),
	)
	const next = nextUncalledIndex !== null ? sequence[nextUncalledIndex] : null
	if (!next) return null

	return { next: { questionId: next.id, title: next.title } }
}
