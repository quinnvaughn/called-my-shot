import { useRouteContext } from "@tanstack/react-router"
import { MdScoreboard } from "react-icons/md"
import { css } from "styled-system/css"
import { GameShareModal } from "#/components/games/game-share-modal"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { ballotMemberState } from "#/lib/ballot-member-state"
import { viewerGamePicksSummary } from "#/lib/game-entry"
import { gameQuestionChipLabels } from "#/lib/game-question-chip-label"
import { officialQuestionSequence } from "#/lib/official-game-questions"
import { openModal } from "#/stores/modal-store"
import { QuestionSetStrip } from "./question-set-strip"

const shareActionClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	color: "primary.default",
	whiteSpace: "nowrap",
	minHeight: { base: "44px", sm: "0" },
	cursor: "pointer",
	_hover: { opacity: 0.8 },
})

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
	const { me } = useRouteContext({ from: "__root__" })
	const game = question.game
	if (!game || game.officialQuestions.length < 2) return null

	const sequence = officialQuestionSequence(game.officialQuestions)
	const chipLabels = gameQuestionChipLabels(sequence.map((e) => e.question))
	const matchup = `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`
	const summary = viewerGamePicksSummary(game.officialQuestions)

	return (
		<QuestionSetStrip
			name={matchup}
			icon={MdScoreboard}
			navigationLabel="game"
			setSummary={`${sequence.length} official`}
			startLabel="first question"
			endLabel="last question"
			currentQuestionId={question.id}
			action={
				me &&
				summary.calledCount > 0 && (
					<button
						type="button"
						className={shareActionClass}
						onClick={() =>
							openModal(
								<GameShareModal
									gameId={game.id}
									username={me.username}
									matchup={matchup}
									summary={summary}
								/>,
							)
						}
					>
						Share your picks
					</button>
				)
			}
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
