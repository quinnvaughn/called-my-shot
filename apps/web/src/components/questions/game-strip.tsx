import { MdScoreboard } from "react-icons/md"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { ballotMemberState } from "#/lib/ballot-member-state"
import { gameQuestionChipLabels } from "#/lib/game-question-chip-label"
import { officialQuestionSequence } from "#/lib/official-game-questions"
import { QuestionSetStrip } from "./question-set-strip"

export const GameStripFragment = graphql(`
	fragment GameStrip_question on Question {
		id
		game {
			id
			awayTeam {
				id
				abbreviation
			}
			homeTeam {
				id
				abbreviation
			}
			officialQuestions {
				id
				title
				shape
				createdAt
				status
				locksAt
				stat {
					id
					name
				}
				subjectTeam {
					id
					abbreviation
				}
				subjectPlayer {
					id
					name
				}
				options {
					id
					label
				}
				viewerCall {
					id
					hitTolerance
					totalPoints
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

type Props = {
	question: FragmentType<typeof GameStripFragment>
}

// A game's official questions as one navigable set, in the game page's
// order (see official-game-questions.ts). Renders nothing for a question with
// no game, or a game with fewer than two official questions to move between.
export function GameStrip({ question: questionProp }: Props) {
	const question = useFragment(GameStripFragment, questionProp)
	const game = question.game
	if (!game || game.officialQuestions.length < 2) return null

	const sequence = officialQuestionSequence(game.officialQuestions)
	const chipLabels = gameQuestionChipLabels(sequence.map((e) => e.question))

	return (
		<QuestionSetStrip
			name={`${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`}
			icon={MdScoreboard}
			navigationLabel="game"
			setSummary={`${sequence.length} official`}
			startLabel="first question"
			endLabel="last question"
			currentQuestionId={question.id}
			members={sequence.map(({ section, question: member }, index) => {
				const chipLabel = chipLabels[index] ?? String(index + 1)
				return {
					key: member.id,
					questionId: member.id,
					questionTitle: member.title,
					state: ballotMemberState(member, member.viewerCall),
					chipLabel,
					navLabel: member.title,
					navKicker: section,
					section,
					points: member.viewerCall?.totalPoints ?? null,
					listTrailing: null,
					jumpLabel: chipLabel,
				}
			})}
		/>
	)
}
