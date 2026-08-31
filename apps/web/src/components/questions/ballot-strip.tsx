import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { FaCheck, FaChevronDown, FaXmark } from "react-icons/fa6"
import { FiChevronLeft, FiChevronRight, FiLayers } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import type { SystemStyleObject } from "styled-system/types"
import { Card } from "#/components/ui/card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import {
	type BallotMemberState,
	ballotMemberState,
} from "#/lib/ballot-member-state"

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

// Plain style objects, not pre-generated classes - the "current" dot needs
// to swap the border itself (not ring it with an outline), and merging two
// already-atomized classes that both set `border` via cx() is unreliable
// (atomic CSS ordering isn't guaranteed to follow JSX order). Passing both
// objects into one css() call merges them before atomizing, so only one
// `border` declaration ever comes out the other side.
const dotStateStyle: Record<BallotMemberState, SystemStyleObject> = {
	uncalled: {
		color: "fg.subtle",
		backgroundColor: "transparent",
		border: "1px dotted {colors.fg.subtle}",
	},
	pending: {
		color: "fg.default",
		backgroundColor: "bg.subtle",
		border: "1px solid {colors.fg.muted}",
		fontWeight: "bold",
	},
	won: {
		color: "success.default",
		backgroundColor: "success.default/8",
		border: "1px solid {colors.success.default/40}",
	},
	lost: {
		color: "danger.default",
		backgroundColor: "danger.default/8",
		border: "1px solid {colors.danger.default/40}",
	},
	missed: {
		color: "fg.subtle",
		backgroundColor: "transparent",
		border: "1px solid {colors.border.default}",
		opacity: 0.4,
		textDecoration: "line-through",
	},
}

// Prev/next nav boxes and the list-slot column are the only pieces actually
// reused across more than one JSX call site (prev vs. next, points vs. no
// points) - everything else in this file is styled inline at the one spot
// it's used, matching pick-state-icon.tsx/locked-badge.tsx elsewhere in this
// directory.
const navBoxClass = css({
	flex: "1",
	minWidth: "0",
	display: "flex",
	alignItems: "center",
	gap: "2",
	backgroundColor: "bg.subtle",
	border: "1px solid {colors.border.default}",
	borderRadius: "lg",
	paddingBlock: "2",
	paddingInline: "2.5",
	overflow: "hidden",
})

const navBoxLinkClass = css({ _hover: { borderColor: "border.emphasized" } })
const navBoxEmptyClass = css({
	justifyContent: "center",
	opacity: 0.5,
})

const navArrowClass = css({ color: "fg.subtle", flexShrink: "0" })

const navTextClass = css({
	display: "flex",
	flexDirection: "column",
	minWidth: "0",
	gap: "0.5",
})

const navSlotClass = css({
	fontFamily: "mono",
	fontSize: "3xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	color: "fg.subtle",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
})

const navLabelClass = css({
	fontSize: "xs",
	color: "fg.body",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
})

const emptyNavTextClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	color: "fg.subtle",
})

const listSlotClass = css({
	fontFamily: "mono",
	fontSize: "3xs",
	letterSpacing: "wide",
	color: "fg.subtle",
	flexShrink: "0",
})

const stateIconClass: Record<BallotMemberState, string> = {
	uncalled: css({ border: "1px solid {colors.fg.subtle}" }),
	// Filled but neutral (not primary-colored) - the tone that carries
	// meaning here is won/lost, not "in progress", so pending stays gray.
	pending: css({
		backgroundColor: "fg.subtle",
		border: "1px solid {colors.fg.subtle}",
	}),
	won: css({
		backgroundColor: "success.default/15",
		border: "1px solid {colors.success.default/50}",
		color: "success.default",
	}),
	lost: css({
		backgroundColor: "danger.default/15",
		border: "1px solid {colors.danger.default/50}",
		color: "danger.default",
	}),
	missed: css({
		border: "1px dashed {colors.fg.subtle}",
		opacity: 0.5,
	}),
}

function MemberStateIcon({ state }: { state: BallotMemberState }) {
	return (
		<div
			className={cx(
				// Fixed 14px regardless of state - this is a row-list glyph, not
				// the bigger PickStateIcon used on a pick card, so it isn't reused
				// here (that component's own size serves a different context and
				// shouldn't be pulled off its token to fit this one).
				css({
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					width: "14px",
					height: "14px",
					borderRadius: "full",
					flexShrink: "0",
				}),
				stateIconClass[state],
			)}
		>
			{state === "won" && <FaCheck size={8} />}
			{state === "lost" && <FaXmark size={8} />}
		</div>
	)
}

type Props = {
	question: FragmentType<typeof BallotStripFragment>
}

// Pure navigation/discovery over a set of independently-resolving questions
// - renders nothing if this question isn't part of a (published) ballot. Each
// member's state is derived from the exact same fields the rest of the app
// already uses for won/lost (see question-result-block.tsx/viewer-status-card.tsx),
// not a parallel state machine - only the "which of the 5 faces is this"
// bucketing is new here.
export function BallotStrip({ question: questionProp }: Props) {
	const [expanded, setExpanded] = useState(false)
	const question = useFragment(BallotStripFragment, questionProp)
	const membership = question.ballotMembership
	if (!membership) return null

	// Already server-ordered by sortOrder (see BallotRef.members in ballot.ts) -
	// no client-side reordering needed, just locate this question's position.
	const members = membership.ballot.members
	const currentIndex = members.findIndex((m) => m.question.id === question.id)
	const prev = currentIndex > 0 ? members[currentIndex - 1] : null
	const next =
		currentIndex >= 0 && currentIndex < members.length - 1
			? members[currentIndex + 1]
			: null

	const states = members.map(ballotMemberState)
	const resolvedCount = states.filter((s) => s === "won" || s === "lost").length
	const pendingCount = states.filter((s) => s === "pending").length
	const calledCount = resolvedCount + pendingCount
	const wonCount = states.filter((s) => s === "won").length
	// Only resolved calls ever carry a non-null totalPoints (see CallRef.totalPoints
	// in the API - null while any pick is still pending), so this is a plain sum
	// with no extra filtering needed.
	const totalPoints = members.reduce(
		(sum, m) => sum + (m.question.viewerCall?.totalPoints ?? 0),
		0,
	)

	// Excludes currentIndex itself - otherwise, when the current question is
	// the only uncalled one left, the wraparound fallback below would point
	// the jump button right back at the page you're already on.
	const uncalledIndexes = states
		.map((s, i) => (s === "uncalled" ? i : -1))
		.filter((i) => i !== -1 && i !== currentIndex)
	const nextUnansweredIndex =
		uncalledIndexes.find((i) => i > currentIndex) ?? uncalledIndexes[0] ?? null
	const nextUnanswered =
		nextUnansweredIndex !== null ? members[nextUnansweredIndex] : null

	return (
		<Card>
			<Card.Body>
				<VStack gap="3" alignItems="stretch">
					<HStack justify="space-between" alignItems="center" gap="2">
						<span
							className={css({
								display: "flex",
								alignItems: "center",
								gap: "1.5",
								minWidth: "0",
								color: "fg.muted",
							})}
						>
							<FiLayers size={12} className={css({ flexShrink: "0" })} />
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									letterSpacing: "wide",
									textTransform: "uppercase",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								})}
							>
								{membership.ballot.name}
							</span>
						</span>
						<button
							type="button"
							onClick={() => setExpanded((v) => !v)}
							aria-expanded={expanded}
							className={css({
								display: "flex",
								alignItems: "center",
								gap: "1.5",
								fontFamily: "mono",
								fontSize: "2xs",
								color: "fg.subtle",
								whiteSpace: "nowrap",
								flexShrink: "0",
								cursor: "pointer",
								_hover: { color: "fg.default" },
							})}
						>
							{currentIndex + 1} of {members.length}
							<FaChevronDown
								size={9}
								className={css({
									transition: "transform 0.15s ease",
									transform: expanded ? "rotate(180deg)" : undefined,
								})}
							/>
						</button>
					</HStack>

					<HStack gap="1.5" flexWrap="wrap">
						{members.map((member, i) => (
							<Link
								key={member.id}
								to="/questions/$questionId"
								params={{ questionId: member.question.id }}
								title={`${member.label} — ${states[i]}`}
								className={cx(
									css({
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										height: "26px",
										minWidth: "26px",
										paddingInline: "7px",
										borderRadius: "7px",
										fontFamily: "mono",
										fontSize: "3xs",
										letterSpacing: "wide",
										flexShrink: "0",
									}),
									css(
										dotStateStyle[states[i]],
										i === currentIndex && {
											border: "1.5px solid {colors.primary.default}",
										},
									),
								)}
							>
								{member.slot || i + 1}
							</Link>
						))}
					</HStack>

					{expanded && (
						<VStack
							gap="0"
							alignItems="stretch"
							className={css({
								maxHeight: "56",
								overflowY: "auto",
								borderTop: "1px solid {colors.border.default}",
								borderBottom: "1px solid {colors.border.default}",
								paddingBlock: "1",
							})}
						>
							{members.map((member, i) => {
								const points = member.question.viewerCall?.totalPoints ?? null
								const isCurrent = i === currentIndex
								return (
									<Link
										key={member.id}
										to="/questions/$questionId"
										params={{ questionId: member.question.id }}
										className={css({
											display: "flex",
											alignItems: "center",
											gap: "2.5",
											width: "full",
											textAlign: "left",
											borderRadius: "md",
											paddingBlock: "1.5",
											paddingInline: "2",
											backgroundColor: isCurrent ? "bg.subtle" : undefined,
											_hover: { backgroundColor: "bg.subtle" },
										})}
									>
										<span
											className={css({
												fontFamily: "mono",
												fontSize: "2xs",
												color: "fg.subtle",
												width: "4",
												flexShrink: "0",
												textAlign: "right",
											})}
										>
											{i + 1}
										</span>
										<MemberStateIcon state={states[i]} />
										<span
											className={css({
												fontSize: "xs",
												color: isCurrent ? "fg.default" : "fg.subtle",
												fontWeight: isCurrent ? "medium" : undefined,
												opacity: states[i] === "missed" ? 0.55 : undefined,
												flex: "1",
												minWidth: "0",
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											})}
										>
											{member.question.title}
										</span>
										{points !== null ? (
											<span
												className={cx(
													listSlotClass,
													css({
														color:
															points >= 0
																? "success.default"
																: "danger.default",
													}),
												)}
											>
												{points >= 0 ? "+" : "−"}
												{Math.abs(points)}
											</span>
										) : (
											<span className={listSlotClass}>{member.slot}</span>
										)}
									</Link>
								)
							})}
						</VStack>
					)}

					<HStack gap="2" alignItems="stretch">
						{prev ? (
							<Link
								to="/questions/$questionId"
								params={{ questionId: prev.question.id }}
								className={cx(navBoxClass, navBoxLinkClass)}
							>
								<FiChevronLeft className={navArrowClass} />
								<span className={navTextClass}>
									{prev.slot && (
										<span className={navSlotClass}>{prev.slot}</span>
									)}
									<span className={navLabelClass}>{prev.label}</span>
								</span>
							</Link>
						) : (
							<div className={cx(navBoxClass, navBoxEmptyClass)}>
								<span className={emptyNavTextClass}>start of ballot</span>
							</div>
						)}
						{next ? (
							<Link
								to="/questions/$questionId"
								params={{ questionId: next.question.id }}
								className={cx(
									navBoxClass,
									navBoxLinkClass,
									css({ justifyContent: "flex-end", textAlign: "right" }),
								)}
							>
								<span className={navTextClass}>
									{next.slot && (
										<span className={navSlotClass}>{next.slot}</span>
									)}
									<span className={navLabelClass}>{next.label}</span>
								</span>
								<FiChevronRight className={navArrowClass} />
							</Link>
						) : (
							<div className={cx(navBoxClass, navBoxEmptyClass)}>
								<span className={emptyNavTextClass}>end of ballot</span>
							</div>
						)}
					</HStack>

					<HStack justify="space-between" alignItems="baseline" gap="2">
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								color: "fg.subtle",
							})}
						>
							{resolvedCount > 0
								? `${wonCount} of ${resolvedCount} right${
										pendingCount > 0 ? ` · ${pendingCount} pending` : ""
									}`
								: `${calledCount} of ${members.length} called`}
						</span>
						{resolvedCount > 0 && (
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "xs",
									fontWeight: "bold",
									color:
										totalPoints >= 0 ? "success.default" : "danger.default",
								})}
							>
								{totalPoints >= 0 ? "+" : "−"}
								{Math.abs(totalPoints)}
							</span>
						)}
					</HStack>

					{nextUnanswered && (
						<Link
							to="/questions/$questionId"
							params={{ questionId: nextUnanswered.question.id }}
							className={css({
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								gap: "1.5",
								width: "full",
								backgroundColor: "bg.subtle",
								border: "1px solid {colors.border.default}",
								borderRadius: "lg",
								paddingBlock: "2.5",
								fontFamily: "mono",
								fontSize: "2xs",
								letterSpacing: "wide",
								color: "primary.default",
								_hover: { borderColor: "primary.default" },
							})}
						>
							<span className={css({ textTransform: "uppercase" })}>
								next unanswered: {nextUnanswered.slot || nextUnanswered.label}
							</span>
							<FiChevronRight />
						</Link>
					)}
				</VStack>
			</Card.Body>
		</Card>
	)
}
