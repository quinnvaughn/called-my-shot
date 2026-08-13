import { Link } from "@tanstack/react-router"
import { FaLock } from "react-icons/fa6"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
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
		user {
			name
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
	// Whose call this is, as shown in "{label} called...". Defaults to the
	// caller's name - right for the group's Answered tab, which excludes the
	// viewer's own calls server-side so this is always someone else's. My
	// Calls overrides this to "You" since every card there is the viewer's.
	label?: string
}

export function CallCard({ call: callProp, label: labelProp }: CallCardProps) {
	const call = useFragment(CallCardFragment, callProp)
	const label = labelProp ?? call.user.name

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
			<Card
				size="sm"
				interactive
				style={
					call.question.subjectTeam
						? {
								borderLeftColor: call.question.subjectTeam.color,
								borderLeftWidth: "3px",
							}
						: undefined
				}
			>
				<Card.Body>
					<VStack gap="2" alignItems="stretch">
						<QuestionSummaryHeader question={call.question} />
						<VStack
							gap="2"
							alignItems="stretch"
							borderTop="1px solid {colors.border.default}"
							paddingTop="2.5"
						>
							{call.viewerCanSeePick ? (
								<>
									<PickSummaryRow call={call} label={label} />
									{call.caseText && (
										<span
											className={css({
												fontSize: "xs",
												color: "fg.subtle",
												fontStyle: "italic",
											})}
										>
											"{call.caseText}"
										</span>
									)}
								</>
							) : (
								<HStack gap="2" alignItems="center">
									<FaLock
										size={12}
										className={css({ color: "fg.subtle", flexShrink: "0" })}
									/>
									<span
										className={css({
											fontSize: "xs",
											color: "fg.subtle",
											fontFamily: "mono",
										})}
									>
										{label} called this — make your call to reveal
									</span>
								</HStack>
							)}
						</VStack>
					</VStack>
				</Card.Body>
			</Card>
		</Link>
	)
}
