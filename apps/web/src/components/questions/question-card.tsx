import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { fieldSignal } from "#/lib/field-signal"
import { AWAITING_RESULT_TEXT } from "#/lib/question-labels"
import { CardRule } from "./card-rule"
import { LockLine } from "./lock-line"
import { LockedBadge } from "./locked-badge"
import { QuestionResultBlock } from "./question-result-block"
import { QuestionSummaryHeader } from "./question-summary-header"

export const QuestionCardFragment = graphql(`
	fragment QuestionCard_question on Question {
		id
		title
		type
		status
		isOfficial
		locksAt
		numericActualValue
		callCount
		averageGuess
		league {
			id
			abbreviation
		}
		options {
			id
			label
			fieldPct
			isCorrect
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
		viewerCall {
			id
		}
	}
`)

type QuestionCardProps = {
	question: FragmentType<typeof QuestionCardFragment>
	// Who put this question in front of the viewer in *this* list - distinct
	// from the question's own creator (not shown on this card at all). Only
	// the group's Shared tab has one; every other context leaves it unset.
	sharedBy?: { name: string }
}

export function QuestionCard({
	question: questionProp,
	sharedBy,
}: QuestionCardProps) {
	const question = useFragment(QuestionCardFragment, questionProp)
	const isSettled =
		question.status === "RESOLVED" || question.status === "DISPUTED"
	const isLocked = question.status === "LOCKED"
	const signal = !isSettled ? fieldSignal(question) : null

	return (
		<Link
			to="/questions/$questionId"
			params={{ questionId: question.id }}
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
					<QuestionSummaryHeader
						question={question}
						sharedBy={sharedBy}
						showTypeTag
						viewerCalled={question.viewerCall !== null}
					/>
					<CardRule />
					{isSettled ? (
						<QuestionResultBlock
							question={question}
							disputed={question.status === "DISPUTED"}
						/>
					) : (
						<VStack gap="1.5" alignItems="stretch">
							<HStack justify="space-between" alignItems="center" gap="3">
								{signal && (
									<span
										className={css({
											fontFamily: "mono",
											fontSize: "2xs",
											color: "fg.subtle",
										})}
									>
										{signal.before}
										<span
											className={css({
												color: "fg.body",
												fontWeight: "bold",
											})}
										>
											{signal.emphasis}
										</span>
										{signal.after}
									</span>
								)}
								{isLocked ? (
									<LockedBadge />
								) : (
									<span
										className={css({
											fontFamily: "mono",
											fontSize: "3xs",
											color: "fg.subtle",
											whiteSpace: "nowrap",
										})}
									>
										<LockLine
											status={question.status}
											locksAt={question.locksAt}
										/>
									</span>
								)}
							</HStack>
							{isLocked && (
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "3xs",
										color: "fg.subtle",
									})}
								>
									{AWAITING_RESULT_TEXT}
								</span>
							)}
						</VStack>
					)}
				</VStack>
			</Card>
		</Link>
	)
}
