import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { ballotMemberState } from "#/lib/ballot-member-state"
import { matchupLabel } from "#/lib/game-status"
import { nextUpEntry, pickNextUp } from "#/lib/next-up"
import { officialQuestionSequence } from "#/lib/official-game-questions"

export const GameNextUpFragment = graphql(`
	fragment GameNextUp_question on Question {
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
	questionProp: FragmentType<typeof GameNextUpFragment> | null,
): GameNextUp | null {
	const question = useFragment(GameNextUpFragment, questionProp)
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
