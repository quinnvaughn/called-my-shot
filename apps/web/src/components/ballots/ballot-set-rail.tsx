import { Link } from "@tanstack/react-router"
import {
	BallotShareRow,
	buildBallotTweet,
} from "#/components/ballots/ballot-share-row"
import { QuestionSetRail } from "#/components/questions/question-set-rail/question-set-rail"
import { railHeadingLinkClass } from "#/components/questions/question-set-rail/rail-styles"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { ballotEntryPath } from "#/lib/ballot-entry"
import { ballotMemberState } from "#/lib/ballot-member-state"
import { pickSummary } from "#/lib/call-summary"
import {
	type QuestionSetRailRow,
	questionSetRailSummary,
} from "#/lib/question-set-rail"

export const BallotSetRailFragment = graphql(`
	fragment BallotSetRail_question on Question {
		id
		ballotMembership {
			id
			ballot {
				id
				name
				slug
				members {
					id
					label
					section
					question {
						id
						title
						shape
						status
						locksAt
						ouLine
						numericActualValue
						numericToleranceAbsolute
						stat {
							id
							toleranceTier {
								id
								toleranceMode
								toleranceValue
							}
						}
						viewerCall {
							id
							guessValue
							conviction
							totalPoints
							hitTolerance
							payout {
								winLow
								winHigh
								lose
							}
							selections {
								id
								conviction
								option {
									id
									label
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
	question: FragmentType<typeof BallotSetRailFragment>
	// Null when signed out.
	username: string | null
}

// A ballot's members beside each of its questions, also opened as a sheet
// from RailTab below xl. Renders nothing for a question that isn't on a (published)
// ballot. Members come back in the ballot's own order (see
// BallotRef.members).
export function BallotSetRail({ question: questionProp, username }: Props) {
	const question = useFragment(BallotSetRailFragment, questionProp)
	const ballot = question.ballotMembership?.ballot
	if (!ballot) return null

	const rows = ballot.members.map(
		({ label, section, question: member }): QuestionSetRailRow => {
			const call = member.viewerCall
			return {
				questionId: member.id,
				questionTitle: member.title,
				questionStatus: member.status,
				locksAt: member.locksAt,
				label,
				section: section ?? null,
				state: ballotMemberState(member, call),
				call: call
					? {
							pick: pickSummary({ ...call, question: member }),
							totalPoints: call.totalPoints,
							payout: call.payout ?? null,
						}
					: null,
				live: null,
			}
		},
	)
	const summary = questionSetRailSummary(rows)

	return (
		<QuestionSetRail
			heading={
				<Link
					to="/ballots/$ballotSlug"
					params={{ ballotSlug: ballot.slug }}
					className={railHeadingLinkClass}
				>
					{ballot.name} →
				</Link>
			}
			rows={rows}
			username={username}
			signedOutText={
				rows.some((r) => r.state === "uncalled")
					? "Sign in to fill out this ballot. Your picks and how they did show up here."
					: "Sign in to see your calls and how they did."
			}
			currentQuestionId={question.id}
			picksPath={username ? ballotEntryPath(ballot.slug, username) : null}
			share={
				username && (
					<BallotShareRow
						ballotId={ballot.id}
						ballotSlug={ballot.slug}
						username={username}
						shareTitle={`@${username}'s ${ballot.name} ballot`}
						surface="question_rail"
						layout="icons"
						tweetText={buildBallotTweet({
							ballotName: ballot.name,
							calledCount: summary.calledCount,
							memberCount: summary.questionCount,
							wins: summary.wins,
							losses: summary.losses,
							points: summary.points,
							isOwn: true,
						})}
					/>
				)
			}
		/>
	)
}
