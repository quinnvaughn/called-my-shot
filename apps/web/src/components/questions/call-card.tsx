import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { CallIdentityRow } from "./call-identity-row"
import { CallLockedBox } from "./call-locked-box"
import { CaseBlock } from "./case-block"
import { PickSummaryRow } from "./pick-summary-row"
import { QuestionSummaryHeader } from "./question-summary-header"

export const CallCardFragment = graphql(`
	fragment CallCard_call on Call {
		id
		guessValue
		conviction
		totalPoints
		caseText
		viewerCanSeePick
		createdAt
		callerLeagueAccuracy
		user {
			name
			username
		}
		question {
			id
			title
			type
			category
			isOfficial
			status
			resolutionNote
			ouLine
			numericActualValue
			league {
				id
				abbreviation
			}
			options {
				id
				label
				isCorrect
			}
			creator {
				id
				name
				username
			}
			viewerCall {
				id
			}
			subjectTeam {
				id
				abbreviation
				color
			}
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
`)

type CallCardProps = {
	call: FragmentType<typeof CallCardFragment>
}

export function CallCard({ call: callProp }: CallCardProps) {
	const call = useFragment(CallCardFragment, callProp)

	return (
		<Link
			to="/questions/$questionId"
			params={{ questionId: call.question.id }}
			className={css({
				display: "block",
				textDecoration: "none",
				color: "inherit",
			})}
		>
			<Card size="sm" interactive>
				<Card.Body>
					<VStack gap="2" alignItems="stretch">
						<QuestionSummaryHeader question={call.question} compact />
						<VStack
							gap="2.5"
							alignItems="stretch"
							borderTop="1px solid {colors.border.default}"
							paddingTop="2.5"
						>
							<CallIdentityRow
								name={call.user.name}
								username={call.user.username}
								leagueAccuracy={call.callerLeagueAccuracy}
								leagueAbbreviation={call.question.league.abbreviation}
								createdAt={call.createdAt}
							/>
							{call.viewerCanSeePick ? (
								<VStack
									gap="2"
									alignItems="stretch"
									className={css({
										background: "bg.canvas",
										borderRadius: "md",
										padding: "2.5",
									})}
								>
									<PickSummaryRow call={call} />
								</VStack>
							) : (
								<CallLockedBox name={call.user.name} />
							)}
							{call.viewerCanSeePick && call.caseText && (
								<CaseBlock text={call.caseText} />
							)}
						</VStack>
					</VStack>
				</Card.Body>
			</Card>
		</Link>
	)
}
