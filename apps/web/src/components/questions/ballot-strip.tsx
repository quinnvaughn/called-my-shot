import { Link } from "@tanstack/react-router"
import { Fragment, useEffect, useState } from "react"
import { match } from "ts-pattern"
import { FaCheck, FaChevronDown, FaXmark } from "react-icons/fa6"
import { FiChevronDown, FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { MdBallot } from "react-icons/md"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import type { SystemStyleObject } from "styled-system/types"
import { Card } from "#/components/ui/card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import {
	type BallotMemberState,
	ballotMemberState,
} from "#/lib/ballot-member-state"
import { buildQuestionSlug } from "#/lib/slug"

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

const stripNameClass = css({
	display: "flex",
	alignItems: "center",
	gap: "1.5",
	minWidth: "0",
	color: "fg.muted",
})

const stripNameTextClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
})

const stripCountClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	color: "fg.subtle",
	whiteSpace: "nowrap",
	flexShrink: "0",
})

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

// A chip is a bordered, filled, mono-3xs box; a caption set in the same mono
// 3xs with no box of its own still reads as one more chip in the row, just an
// unstyled one. So the caption gets a treatment of its own rather than the
// absence of the chip's: widest tracking, and a hairline rule under it
// spanning its cluster - a section marker, which nothing clickable in this
// card has. Not dimmed any further to separate it: fg.subtle is already the
// bottom of the fg scale (see panda.config.ts) and anything under it stops
// being readable.
const sectionCaptionClass = css({
	fontFamily: "mono",
	fontSize: "3xs",
	letterSpacing: "widest",
	textTransform: "uppercase",
	color: "fg.subtle",
	whiteSpace: "nowrap",
	width: "full",
	paddingBottom: "1",
	borderBottom: "1px solid {colors.border.default}",
})

// The expanded list is a vertical run of rows, not a grid of clickable
// chips, so its headings need no rule to separate them from anything - the
// row layout already does that.
const sectionHeadingClass = css({
	fontFamily: "mono",
	fontSize: "3xs",
	letterSpacing: "widest",
	textTransform: "uppercase",
	color: "fg.subtle",
	flexShrink: "0",
	whiteSpace: "nowrap",
})

// Consecutive members sharing a section (a division, on a win-totals
// ballot), which is what lets the chip grid start a new line at every group
// boundary instead of wrapping wherever it happens to run out of room. Runs,
// not a group-by: membership is one flat list in sortOrder and a section
// that appears twice in it is drawn twice, matching the order actually
// stored. A ballot with no sections at all comes back as one null-section
// run, which renders exactly as the ungrouped grid always has.
function sectionRuns<T extends { section?: string | null }>(
	members: T[],
): { section: string | null; entries: { member: T; index: number }[] }[] {
	const runs: {
		section: string | null
		entries: { member: T; index: number }[]
	}[] = []
	members.forEach((member, index) => {
		const section = member.section ?? null
		const current = runs.at(-1)
		if (current && current.section === section) current.entries.push({ member, index })
		else runs.push({ section, entries: [{ member, index }] })
	})
	return runs
}

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

// One abbreviation in the grid above the nav. Extracted only because the
// grouped grid and the ungrouped wrapping row both render it - the rest of
// this file still styles inline at its single call site.
function BallotChip({
	member,
	index,
	state,
	isCurrent,
}: {
	member: {
		id: string
		slot?: string | null
		label: string
		question: { id: string; title: string }
	}
	index: number
	state: BallotMemberState
	isCurrent: boolean
}) {
	return (
		<Link
			to="/questions/$questionId/{-$slug}"
			params={{
				questionId: member.question.id,
				slug: buildQuestionSlug(member.question.title),
			}}
			title={`${member.label}: ${state}`}
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
					// Only load-bearing in the ungrouped wrapping row; a grid cell
					// sizes the chip either way.
					flexShrink: "0",
				}),
				css(
					dotStateStyle[state],
					isCurrent && { border: "1.5px solid {colors.primary.default}" },
				),
			)}
		>
			{member.slot || index + 1}
		</Link>
	)
}

// Resolved after mount, since matchMedia doesn't exist while server-
// rendering. It drives only the label and aria state of the header control -
// never the collapse itself, which is plain CSS below, so a phone never
// renders the open strip and then jumps to closed once React takes over.
function useIsCompactViewport(): boolean {
	const [isCompact, setIsCompact] = useState(false)
	useEffect(() => {
		const query = window.matchMedia("(max-width: 639px)")
		const sync = () => setIsCompact(query.matches)
		sync()
		query.addEventListener("change", sync)
		return () => query.removeEventListener("change", sync)
	}, [])
	return isCompact
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
	// null means "whatever this viewport defaults to" - closed on a phone,
	// where the strip is most of the screen, open on anything wider. That
	// default is expressed as CSS rather than as state so it survives server
	// rendering; a reader who touches the control replaces it with an explicit
	// true/false for the rest of the page's life.
	const [collapsedOverride, setCollapsed] = useState<boolean | null>(null)
	const isCompactViewport = useIsCompactViewport()
	const isCollapsed = collapsedOverride ?? isCompactViewport
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
	const runs = sectionRuns(members)
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

	// Written out per case rather than composed, so every rule Panda has to
	// extract is a literal it can see at build time.
	const bodyClass = match(collapsedOverride)
		.with(null, () =>
			css({
				display: { base: "none", sm: "flex" },
				flexDirection: "column",
				gap: "3",
				alignItems: "stretch",
			}),
		)
		.with(true, () => css({ display: "none" }))
		.with(false, () =>
			css({
				display: "flex",
				flexDirection: "column",
				gap: "3",
				alignItems: "stretch",
			}),
		)
		.exhaustive()

	const chevronClass = match(collapsedOverride)
		.with(null, () =>
			css({ transform: { base: "rotate(0deg)", sm: "rotate(180deg)" } }),
		)
		.with(true, () => css({ transform: "rotate(0deg)" }))
		.with(false, () => css({ transform: "rotate(180deg)" }))
		.exhaustive()

	return (
		<Card>
			<Card.Body>
				<VStack gap="3" alignItems="stretch">
					{/* The header is the only control up here, and the whole row is
					    its target: a phone gets the strip closed by default, so the
					    thing that opens it should be the easiest element on the card
					    to hit. The member list has its own disclosure down inside the
					    body - putting it up here too meant two chevrons side by side
					    doing different things. */}
					<button
						type="button"
						onClick={() => setCollapsed(!isCollapsed)}
						aria-expanded={!isCollapsed}
						aria-label={
							isCollapsed ? "Show ballot navigation" : "Hide ballot navigation"
						}
						className={css({
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: "2",
							width: "full",
							// Thumb-sized on a phone; natural height on a pointer device,
							// where an oversized header is just dead space.
							minHeight: { base: "44px", sm: "0" },
							cursor: "pointer",
							_hover: { "& [data-strip-name]": { color: "fg.default" } },
						})}
					>
						<span className={stripNameClass} data-strip-name>
							<MdBallot size={15} className={css({ flexShrink: "0" })} />
							<span className={stripNameTextClass}>
								{membership.ballot.name}
							</span>
						</span>
						<span
							className={css({
								display: "flex",
								alignItems: "center",
								gap: "2",
								flexShrink: "0",
							})}
						>
							<span className={stripCountClass}>
								{currentIndex + 1} of {members.length}
							</span>
							<FiChevronDown
								size={13}
								className={cx(
									css({
										color: "fg.subtle",
										transition: "transform 0.15s ease",
									}),
									chevronClass,
								)}
							/>
						</span>
					</button>

					<div className={bodyClass}>
					{/* The grid is at the section level, not the chip level: equal
					    auto-fit columns, so clusters line up with each other and the
					    column count follows the card width rather than the content.
					    Chips inside a cluster keep their natural width - forcing them
					    onto a shared column count sizes every cluster's cells to the
					    widest section in the ballot, which on an All-Pro ballot
					    (9/5/6) squeezed a four-character slot into a cell too narrow
					    to hold it. An ungrouped ballot is one captionless run, which
					    collapses to a single full-width cluster: the plain wrapping
					    row it has always been. */}
					<div
						className={css({
							display: "grid",
							gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
							columnGap: "4",
							rowGap: "3",
							alignItems: "start",
						})}
					>
						{runs.map((run) => (
							<VStack
								key={run.section ?? "ungrouped"}
								gap="1"
								alignItems="stretch"
							>
								{run.section && (
									<span className={sectionCaptionClass}>{run.section}</span>
								)}
								<HStack gap="1.5" flexWrap="wrap">
									{run.entries.map(({ member, index }) => (
										<BallotChip
											key={member.id}
											member={member}
											index={index}
											state={states[index]}
											isCurrent={index === currentIndex}
										/>
									))}
								</HStack>
							</VStack>
						))}
					</div>

					{/* Named for what the rows are read for - call state,
					    correctness, points - rather than for what the list contains,
					    which the chip grid above already shows. The count stays
					    alongside it: how big this ballot is is worth knowing before
					    opening a scrolling list.

					    Its disclosure lives down here, not in the header: the
					    header's chevron collapses the whole strip, and two chevrons
					    side by side doing different things is exactly what made that
					    row confusing. */}
					<button
						type="button"
						onClick={() => setExpanded((v) => !v)}
						aria-expanded={expanded}
						className={cx(
							stripCountClass,
							css({
								display: "flex",
								alignItems: "center",
								gap: "1.5",
								alignSelf: "flex-start",
								letterSpacing: "wide",
								textTransform: "uppercase",
								minHeight: { base: "44px", sm: "0" },
								cursor: "pointer",
								_hover: { color: "fg.default" },
							}),
						)}
					>
						scorecard · {members.length}
						<FaChevronDown
							size={9}
							className={css({
								transition: "transform 0.15s ease",
								transform: expanded ? "rotate(180deg)" : undefined,
							})}
						/>
					</button>

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
								// Same run boundaries the chip grid above breaks its lines
								// on, drawn here as a heading instead - the list is
								// scrollable and a title alone ("Guess the Boston Celtics'
								// win total") doesn't say which division it sits in.
								const startsSection =
									member.section && member.section !== members[i - 1]?.section
								return (
									<Fragment key={member.id}>
										{startsSection && (
											<span
												className={cx(
													sectionHeadingClass,
													css({
														paddingInline: "2",
														paddingTop: "2",
														paddingBottom: "1",
													}),
												)}
											>
												{member.section}
											</span>
										)}
									<Link
										to="/questions/$questionId/{-$slug}"
										params={{
											questionId: member.question.id,
											slug: buildQuestionSlug(member.question.title),
										}}
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
									</Fragment>
								)
							})}
						</VStack>
					)}

					<HStack gap="2" alignItems="stretch">
						{prev ? (
							<Link
								to="/questions/$questionId/{-$slug}"
								params={{
									questionId: prev.question.id,
									slug: buildQuestionSlug(prev.question.title),
								}}
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
								to="/questions/$questionId/{-$slug}"
								params={{
									questionId: next.question.id,
									slug: buildQuestionSlug(next.question.title),
								}}
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
							to="/questions/$questionId/{-$slug}"
							params={{
								questionId: nextUnanswered.question.id,
								slug: buildQuestionSlug(nextUnanswered.question.title),
							}}
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
					</div>
				</VStack>
			</Card.Body>
		</Card>
	)
}
