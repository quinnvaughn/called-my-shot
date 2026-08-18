import { Link } from "@tanstack/react-router"
import { DateTime } from "luxon"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import type { QuestionStatus } from "#/graphql/generated/graphql"
import { useNow } from "#/hooks/use-now"
import { fieldSignal, resolvedFieldSignal } from "#/lib/field-signal"
import { QuestionSummaryHeader } from "./question-summary-header"

export const QuestionCardFragment = graphql(`
	fragment QuestionCard_question on Question {
		id
		title
		type
		category
		isOfficial
		status
		locksAt
		resolutionNote
		ouLine
		numericActualValue
		numericHitRatePct
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
`)

type QuestionCardProps = {
	question: FragmentType<typeof QuestionCardFragment>
	// Who put this question in front of the viewer in *this* list - distinct
	// from the question's own creator. Only the group's Shared tab has one;
	// every other context leaves it unset and relies on `creator` alone.
	sharedBy?: { name: string }
}

export function QuestionCard({
	question: questionProp,
	sharedBy,
}: QuestionCardProps) {
	const question = useFragment(QuestionCardFragment, questionProp)
	// Disputed carries the same prior-resolution data as resolved (see
	// ResolutionBanner) - both get the resolved field signal and drop the now-
	// redundant lock line below.
	const isSettled =
		question.status === "RESOLVED" || question.status === "DISPUTED"
	const signal = isSettled ? resolvedFieldSignal(question) : fieldSignal(question)

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
			<Card size="sm" interactive>
				<Card.Body>
					<VStack gap="2" alignItems="stretch">
						<QuestionSummaryHeader question={question} sharedBy={sharedBy} />
						<HStack justify="space-between" alignItems="center">
							{signal && (
								<span
									className={css({
										fontSize: "xs",
										color: "fg.subtle",
										fontFamily: "mono",
									})}
								>
									{signal}
								</span>
							)}
							{!isSettled && (
								<span
									className={css({
										fontSize: "xs",
										color: "fg.subtle",
										fontFamily: "mono",
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
					</VStack>
				</Card.Body>
			</Card>
		</Link>
	)
}

// Only OPEN questions need a live countdown - every other status renders
// static text, so this is the only place that pays for the ticking interval.
function LockLine({
	status,
	locksAt,
}: {
	status: QuestionStatus
	locksAt: string
}) {
	const now = useNow(status === "OPEN" ? 60_000 : null)
	return <>{formatLockLine(status, locksAt, now)}</>
}

function formatLockLine(
	status: QuestionStatus,
	locksAt: string,
	now: number,
): string {
	// RESOLVED and DISPUTED never reach here - QuestionCard hides this line for
	// both in favor of ResolutionBanner above.
	if (status === "LOCKED") return "Locked · awaiting resolution"

	const locksAtTime = DateTime.fromISO(locksAt)
	const current = DateTime.fromMillis(now)
	if (locksAtTime <= current) return "Locking any moment"
	return `Locks ${locksAtTime.toRelative({ base: current })}`
}
