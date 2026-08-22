import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Card } from "#/components/ui/card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { CallLockedBox } from "./call-locked-box"
import { CardRule } from "./card-rule"
import { CaseBlock } from "./case-block"
import { DisputedFlag } from "./disputed-flag"
import { LockLine } from "./lock-line"
import { LockedBadge } from "./locked-badge"
import { PersonLine } from "./person-line"
import { PickList } from "./pick-list"
import { QuestionSummaryHeader } from "./question-summary-header"
import { ResultBadge } from "./result-badge"

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
			username
		}
		question {
			id
			title
			shape
			status
			isOfficial
			ouLine
			numericActualValue
			locksAt
			league {
				id
				abbreviation
			}
			game {
				id
				status
				startsAt
				homeScore
				awayScore
				homeTeam {
					id
					abbreviation
					color
				}
				awayTeam {
					id
					abbreviation
					color
				}
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
			<Card
				interactive
				className={css({
					borderRadius: "10px",
					paddingBlock: "1.15rem",
					paddingInline: "1.3rem",
				})}
			>
				<VStack gap="2.5" alignItems="stretch">
					<QuestionSummaryHeader question={call.question} />
					<CardRule />
					{call.question.status === "DISPUTED" && <DisputedFlag />}
					<PersonLine
						name={call.user.name}
						username={call.user.username}
						badge={
							call.viewerCanSeePick &&
							match(call.question.status)
								.with("OPEN", () => (
									<span
										className={css({
											fontFamily: "mono",
											fontSize: "3xs",
											color: "fg.subtle",
											whiteSpace: "nowrap",
										})}
									>
										<LockLine
											status={call.question.status}
											locksAt={call.question.locksAt}
										/>
									</span>
								))
								.with("LOCKED", () => <LockedBadge />)
								.with("RESOLVED", "DISPUTED", () => (
									<ResultBadge totalPoints={call.totalPoints} />
								))
								.exhaustive()
						}
					/>
					{call.viewerCanSeePick ? (
						<PickList call={call} />
					) : (
						<CallLockedBox name={call.user.name} />
					)}
					{call.viewerCanSeePick && call.caseText && (
						<CaseBlock text={call.caseText} clampable />
					)}
				</VStack>
			</Card>
		</Link>
	)
}
