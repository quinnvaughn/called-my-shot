import { MdScoreboard } from "react-icons/md"
import { css } from "styled-system/css"
import { GameShareModal } from "#/components/games/game-share-modal"
import { QuestionSetStrip } from "#/components/questions/question-set-strip/question-set-strip"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { useMe } from "#/hooks/use-me"
import { ballotMemberState } from "#/lib/ballot-member-state"
import { viewerGamePicksSummary } from "#/lib/game-entry"
import { gameQuestionChipLabels } from "#/lib/game-question-chip-label"
import { matchupLabel } from "#/lib/game-status"
import { nextUpEntry, pickNextUp } from "#/lib/next-up"
import { officialQuestionSequence } from "#/lib/official-game-questions"
import { openModal } from "#/stores/modal-store"

const shareActionClass = css({
	textStyle: "label",
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
				name
				abbreviation
			}
			homeTeam {
				id
				name
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
					currentTeam {
						id
					}
				}
				options {
					id
					label
					team {
						id
					}
					player {
						id
						currentTeam {
							id
						}
					}
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
	className?: string
}

export type GameNextUp = {
	matchup: string
	// Official questions on the game the viewer can still call, not counting
	// the one on screen.
	openCount: number
	next: { questionId: string; title: string }
	// The team the viewer picked to win, when the next question is about it.
	leadInTeamName: string | null
}

// Where the viewer goes after calling this question: the next official
// question on the same game they haven't called yet - who wins first, then
// whatever is about the team they picked to win (see pickNextUp). Null for a
// question with no game or once nothing on it is left open.
export function useGameNextUp(
	questionProp: FragmentType<typeof GameStripFragment> | null,
): GameNextUp | null {
	const question = useFragment(GameStripFragment, questionProp)
	const game = question?.game
	if (!question || !game) return null

	const sequence = officialQuestionSequence(game.officialQuestions).map(
		(e) => e.question,
	)
	const states = sequence.map((q) => ballotMemberState(q, q.viewerCall))
	const currentIndex = sequence.findIndex((q) => q.id === question.id)
	const teams = [game.awayTeam, game.homeTeam]
	const winner = sequence.find((q) => q.shape === "TEAM_VS_TEAM")
	const pickedOptionId = winner?.viewerCall?.selections[0]?.option.id
	const pickedTeamId =
		winner?.options.find((o) => o.id === pickedOptionId)?.team?.id ?? null
	const pick = pickNextUp(
		sequence.map((q) =>
			nextUpEntry(
				q,
				teams.map((t) => t.id),
			),
		),
		states,
		currentIndex,
		pickedTeamId,
	)
	const next = pick ? sequence[pick.index] : null
	if (!pick || !next) return null

	return {
		matchup: matchupLabel(game),
		openCount: states.filter((s, i) => s === "uncalled" && i !== currentIndex)
			.length,
		next: { questionId: next.id, title: next.title },
		leadInTeamName: pick.aboutPickedTeam
			? (teams.find((t) => t.id === pickedTeamId)?.name ?? null)
			: null,
	}
}

// A game's official questions as one navigable set, in the game page's
// order (see official-game-questions.ts). Renders nothing for a question with
// no game, or a game with fewer than two official questions to move between.
export function GameStrip({ question: questionProp, className }: Props) {
	const question = useFragment(GameStripFragment, questionProp)
	const me = useMe()
	const game = question.game
	if (!game || game.officialQuestions.length < 2) return null

	const sequence = officialQuestionSequence(game.officialQuestions)
	const chipLabels = gameQuestionChipLabels(sequence.map((e) => e.question))
	const matchup = matchupLabel(game)
	const summary = viewerGamePicksSummary(game.officialQuestions)

	return (
		<QuestionSetStrip
			className={className}
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
