import { MdBallot } from "react-icons/md"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { ballotMemberState } from "#/lib/ballot-member-state"
import { QuestionSetStrip } from "./question-set-strip"

export const BallotStripFragment = graphql(`
	fragment BallotStrip_question on Question {
		id
		ballotMembership {
			id
			slot
			label
			ballot {
				id
				name
				members {
					id
					slot
					label
					section
					question {
						id
						title
						status
						locksAt
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
		}
	}
`)

type Props = {
	question: FragmentType<typeof BallotStripFragment>
	className?: string
}

// Renders nothing if this question isn't part of a (published) ballot.
// Members come back already ordered by sortOrder (see BallotRef.members in
// ballot.ts).
export function BallotStrip({ question: questionProp, className }: Props) {
	const question = useFragment(BallotStripFragment, questionProp)
	const membership = question.ballotMembership
	if (!membership) return null

	return (
		<QuestionSetStrip
			className={className}
			name={membership.ballot.name}
			icon={MdBallot}
			navigationLabel="ballot"
			startLabel="start of ballot"
			endLabel="end of ballot"
			currentQuestionId={question.id}
			members={membership.ballot.members.map((member, index) => ({
				key: member.id,
				questionId: member.question.id,
				questionTitle: member.question.title,
				state: ballotMemberState(member.question, member.question.viewerCall),
				chipLabel: member.slot || String(index + 1),
				navLabel: member.label,
				navKicker: member.slot || null,
				section: member.section ?? null,
				points: member.question.viewerCall?.totalPoints ?? null,
				listTrailing: member.slot ?? null,
				jumpLabel: member.slot || member.label,
			}))}
		/>
	)
}
