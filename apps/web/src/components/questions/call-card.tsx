import { Link } from "@tanstack/react-router"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { RecordTag } from "#/components/records/record-tag"
import { arrowLink } from "#/components/ui/arrow-link"
import { Card } from "#/components/ui/card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import type { CallCard_CallFragment } from "#/graphql/generated/graphql"
import {
	type CallSummaryData,
	callMarginFor,
	marginLabel,
	resultState,
	toCallSummary,
} from "#/lib/call-summary"
import { toIdentity } from "#/lib/identity"
import { isNumericQuestionShape } from "#/lib/question-labels"
import { type RecordTone, recordTagFor } from "#/lib/record-tag"
import { buildQuestionSlug } from "#/lib/slug"
import { CallPoints } from "./call-points"
import { CardRule } from "./card-rule"
import { CaseBlock } from "./case-block"
import { DisputedFlag } from "./disputed-flag"
import { PersonLine } from "./person-line"
import { PickList } from "./pick-list"
import { QuestionSummaryHeader } from "./question-summary-header"
import { RedoBadge } from "./redo-badge"

export const CallCardFragment = graphql(`
	fragment CallCard_call on Call {
		id
		createdAt
		caseText
		# Presence alone is the badge. What it used to say is only fetched on
		# the call's own page, where there's room to show it.
		redo {
			id
		}
		streak {
			length
		}
		user {
			...Identity_user
		}
		question {
			id
			title
			status
			ballotMembership {
				...BallotKicker_membership
			}
			...QuestionSummaryHeader_question
		}
		...CallSummary_call
		...CallPoints_call
	}
`)

type CallCardProps = {
	call: FragmentType<typeof CallCardFragment>
	// False shows the call as an example with nowhere to go: no hover state
	// and no links to the question or the call, for pages that are meant to
	// have a single way forward.
	linked?: boolean
}

// Lifts an element above the stretched link's overlay so it stays clickable
// and selectable. Anything interactive inside this card needs it - see the
// overlay's own comment below.
const aboveOverlay = css({ position: "relative", zIndex: 1 })

export function CallCard({ call: callProp, linked = true }: CallCardProps) {
	const call = useFragment(CallCardFragment, callProp)
	const caller = toIdentity(call.user)
	const summary = toCallSummary(call)
	const tag = callTag(call, summary)

	return (
		<Card
			interactive={linked}
			className={css({
				position: "relative",
				borderRadius: "10px",
				paddingBlock: "1.15rem",
				paddingInline: "1.3rem",
			})}
		>
			{/* Full height with the link row pushed down, so cards stretched to a
			shared height (the Playing Now row) line their footers up. */}
			<VStack gap="2.5" alignItems="stretch" height="full">
				<QuestionSummaryHeader
					question={call.question}
					ballotMembership={call.question.ballotMembership}
					// The redo badge rides alongside the tag rather than
					// replacing it - a redone call still has a standing, and
					// which it is matters more than how it got there.
					trailing={
						<HStack gap="1.5" alignItems="center">
							{call.redo && <RedoBadge />}
							<RecordTag tone={tag.tone}>{tag.label}</RecordTag>
						</HStack>
					}
				/>
				<CardRule />
				{call.question.status === "DISPUTED" && <DisputedFlag />}
				<PersonLine
					name={caller.name}
					username={caller.username}
					avatarUrl={caller.avatarUrl}
					flair={caller.flair}
					calledAt={call.createdAt}
				/>
				<PickList call={summary} />
				<CallPoints call={call} />
				{/* CaseBlock renders a real "Show more" button when the case
				overflows, so it has to sit above the overlay. It used to be
				inside the anchor that wrapped this whole card - a button nested
				in an <a>, where the click bubbled up and navigated instead of
				expanding. */}
				{call.caseText && (
					<div className={aboveOverlay}>
						<CaseBlock text={call.caseText} clampable />
					</div>
				)}

				{linked && (
					<HStack
						justify="space-between"
						alignItems="center"
						gap="3"
						marginBlockStart="auto"
					>
						{/* The card's primary destination, stretched over the whole
						card by the ::after below rather than by wrapping everything
						in one anchor. Two real sibling links instead of one giant
						one: cmd-click works on both, and a screen reader reads two
						labelled destinations rather than announcing the card's
						entire text content as a single link name. */}
						<Link
							to="/questions/$questionId/{-$slug}"
							params={{
								questionId: call.question.id,
								slug: buildQuestionSlug(call.question.title),
							}}
							className={css({
								textStyle: "label",
								color: "fg.subtle",
								textDecoration: "none",
								_hover: { color: "fg.muted" },
								_after: {
									content: '""',
									position: "absolute",
									inset: "0",
									borderRadius: "10px",
								},
							})}
						>
							The question →
						</Link>
						<Link
							to="/calls/$callId"
							params={{ callId: call.id }}
							className={cx(
								aboveOverlay,
								arrowLink({ tone: "primary", align: "parent" }),
							)}
						>
							The call →
						</Link>
					</HStack>
				)}
			</VStack>
		</Card>
	)
}

type CallCardData = CallCard_CallFragment

// The same tag the call's own page leads with - see recordTagFor.
function callTag(
	call: CallCardData,
	summary: CallSummaryData,
): { tone: RecordTone; label: string } {
	const result = resultState(summary.totalPoints)
	const isWin = result.status === "pending" ? null : result.status === "win"
	const margin = callMarginFor(summary)
	return recordTagFor({
		status: call.question.status,
		isWin,
		nailed:
			isWin === true &&
			isNumericQuestionShape(summary.question.shape) &&
			summary.guessValue !== null &&
			summary.guessValue === summary.question.numericActualValue,
		marginLabel:
			isWin !== null && margin?.verdict
				? marginLabel(margin.verdict, isWin)
				: null,
		streakLength: call.streak?.length ?? null,
	})
}
