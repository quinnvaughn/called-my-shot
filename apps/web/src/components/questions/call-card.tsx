import { Link } from "@tanstack/react-router"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Card } from "#/components/ui/card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { toIdentity } from "#/lib/identity"
import { buildQuestionSlug } from "#/lib/slug"
import { CardRule } from "./card-rule"
import { CaseBlock } from "./case-block"
import { DisputedFlag } from "./disputed-flag"
import { LockLine } from "./lock-line"
import { LockedBadge } from "./locked-badge"
import { PersonLine } from "./person-line"
import { PickList } from "./pick-list"
import { QuestionSummaryHeader } from "./question-summary-header"
import { RedoBadge } from "./redo-badge"
import { ResultBadge } from "./result-badge"
import { StreakTag } from "./streak-tag"
import { VoidedBadge } from "./voided-badge"

export const CallCardFragment = graphql(`
	fragment CallCard_call on Call {
		id
		guessValue
		conviction
		totalPoints
		unscoredReason
		caseText
		# Presence alone is the badge. What it used to say is only fetched on
		# the call's own page, where there's room to show it.
		redo {
			id
		}
		streak {
			length
			family
			familyLabel
		}
		user {
			...Identity_user
		}
		question {
			id
			title
			shape
			status
			isOfficial
			ouLine
			numericActualValue
			numericToleranceAbsolute
			numericTolerancePct
			scoredOptions {
				id
				label
				actualValue
			}
			stat {
				id
				toleranceTier {
					id
					toleranceMode
					toleranceValue
				}
			}
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
			ballotMembership {
				id
				ballot {
					id
					name
					memberCount
					viewerCalledCount
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
				actualValue
			}
		}
	}
`)

type CallCardProps = {
	call: FragmentType<typeof CallCardFragment>
}

// Lifts an element above the stretched link's overlay so it stays clickable
// and selectable. Anything interactive inside this card needs it - see the
// overlay's own comment below.
const aboveOverlay = css({ position: "relative", zIndex: 1 })

export function CallCard({ call: callProp }: CallCardProps) {
	const call = useFragment(CallCardFragment, callProp)
	const caller = toIdentity(call.user)

	return (
		<Card
			interactive
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
				/>
				<CardRule />
				{call.question.status === "DISPUTED" && <DisputedFlag />}
				<PersonLine
					name={caller.name}
					username={caller.username}
					flair={caller.flair}
					// The redo badge rides alongside whatever the status slot
					// was already showing rather than replacing it - a redone
					// call still has a lock time or a result, and which it is
					// matters more than how it got there.
					badge={
						<HStack gap="1.5" alignItems="center">
							{call.redo && <RedoBadge />}
							{match(call.question.status)
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
									<HStack gap="1.5" alignItems="center">
										{call.streak && (
											<StreakTag
												length={call.streak.length}
												track={`${call.question.league.abbreviation} ${call.streak.familyLabel}`}
											/>
										)}
										<ResultBadge
											totalPoints={call.totalPoints}
											unscoredReason={call.unscoredReason}
										/>
									</HStack>
								))
								.with("VOIDED", () => <VoidedBadge />)
								.exhaustive()}
						</HStack>
					}
				/>
				<PickList call={call} />
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
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							textTransform: "uppercase",
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
							css({
								fontFamily: "mono",
								fontSize: "2xs",
								letterSpacing: "wide",
								textTransform: "uppercase",
								color: "primary.default",
								textDecoration: "none",
								_hover: { opacity: 0.8 },
							}),
						)}
					>
						The call →
					</Link>
				</HStack>
			</VStack>
		</Card>
	)
}
