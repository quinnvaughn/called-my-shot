import { Link } from "@tanstack/react-router"
import { Fragment, type ReactNode, useEffect, useState } from "react"
import type { IconType } from "react-icons"
import { FaCheck, FaChevronDown, FaXmark } from "react-icons/fa6"
import { FiChevronDown, FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Card } from "#/components/ui/card"
import type { BallotMemberState } from "#/lib/ballot-member-state"
import { questionSetNavigation } from "#/lib/question-set-navigation"
import { buildQuestionSlug } from "#/lib/slug"

// One finished class per (state, isCurrent) pair, rather than a map of style
// objects merged into css() at the call site. Two constraints pin this shape:
//
// - Panda extracts CSS statically, so a style object it only ever sees reach
//   css() through a lookup indexed by a prop produces no CSS at all. Every
//   declaration has to sit literally inside a css() call.
// - The current dot swaps the border itself rather than ringing it with an
//   outline, and hover swaps it again, so state/current/hover all set `border`.
//   Merging separate atomized classes that each set it via cx() is unreliable
//   (atomic CSS ordering isn't guaranteed to follow JSX order), so each pair
//   resolves to exactly one class and the merge happens before atomizing.
//
// The current dot is ringed in secondary blue, which marks where you are;
// primary orange stays the hover on the others, which marks where you can go.
//
// The cost is that the hover block and the current border are spelled out per
// entry. They can't be hoisted into a shared const: a token referenced through
// a variable is invisible to the extractor for the same reason as above.
const dotStateClass: Record<
	BallotMemberState,
	{ default: string; current: string }
> = {
	uncalled: {
		default: css({
			color: "fg.subtle",
			backgroundColor: "transparent",
			border: "1px dotted {colors.fg.subtle}",
			_hover: {
				border: "1px solid {colors.primary.default}",
				backgroundColor: "primary.default/12",
				color: "fg.default",
				opacity: 1,
				textDecoration: "none",
			},
		}),
		current: css({
			color: "fg.subtle",
			backgroundColor: "transparent",
			border: "1.5px solid {colors.secondary.default}",
			_hover: {
				border: "1.5px solid {colors.secondary.default}",
				backgroundColor: "secondary.default/12",
				color: "fg.default",
				opacity: 1,
				textDecoration: "none",
			},
		}),
	},
	pending: {
		default: css({
			color: "fg.default",
			backgroundColor: "bg.subtle",
			border: "1px solid {colors.fg.muted}",
			fontWeight: "bold",
			_hover: {
				border: "1px solid {colors.primary.default}",
				backgroundColor: "primary.default/12",
				color: "fg.default",
				opacity: 1,
				textDecoration: "none",
			},
		}),
		current: css({
			color: "fg.default",
			backgroundColor: "bg.subtle",
			border: "1.5px solid {colors.secondary.default}",
			fontWeight: "bold",
			_hover: {
				border: "1.5px solid {colors.secondary.default}",
				backgroundColor: "secondary.default/12",
				color: "fg.default",
				opacity: 1,
				textDecoration: "none",
			},
		}),
	},
	won: {
		default: css({
			color: "success.default",
			backgroundColor: "success.default/8",
			border: "1px solid {colors.success.default/40}",
			_hover: {
				border: "1px solid {colors.primary.default}",
				backgroundColor: "primary.default/12",
				color: "fg.default",
				opacity: 1,
				textDecoration: "none",
			},
		}),
		current: css({
			color: "success.default",
			backgroundColor: "success.default/8",
			border: "1.5px solid {colors.secondary.default}",
			_hover: {
				border: "1.5px solid {colors.secondary.default}",
				backgroundColor: "secondary.default/12",
				color: "fg.default",
				opacity: 1,
				textDecoration: "none",
			},
		}),
	},
	lost: {
		default: css({
			color: "danger.default",
			backgroundColor: "danger.default/8",
			border: "1px solid {colors.danger.default/40}",
			_hover: {
				border: "1px solid {colors.primary.default}",
				backgroundColor: "primary.default/12",
				color: "fg.default",
				opacity: 1,
				textDecoration: "none",
			},
		}),
		current: css({
			color: "danger.default",
			backgroundColor: "danger.default/8",
			border: "1.5px solid {colors.secondary.default}",
			_hover: {
				border: "1.5px solid {colors.secondary.default}",
				backgroundColor: "secondary.default/12",
				color: "fg.default",
				opacity: 1,
				textDecoration: "none",
			},
		}),
	},
	voided: {
		default: css({
			color: "fg.subtle",
			backgroundColor: "transparent",
			border: "1px solid {colors.fg.subtle}",
			textDecoration: "line-through",
			_hover: {
				border: "1px solid {colors.primary.default}",
				backgroundColor: "primary.default/12",
				color: "fg.default",
				opacity: 1,
				textDecoration: "none",
			},
		}),
		current: css({
			color: "fg.subtle",
			backgroundColor: "transparent",
			border: "1.5px solid {colors.secondary.default}",
			textDecoration: "line-through",
			_hover: {
				border: "1.5px solid {colors.secondary.default}",
				backgroundColor: "secondary.default/12",
				color: "fg.default",
				opacity: 1,
				textDecoration: "none",
			},
		}),
	},
	missed: {
		default: css({
			color: "fg.subtle",
			backgroundColor: "transparent",
			border: "1px solid {colors.border.default}",
			opacity: 0.4,
			textDecoration: "line-through",
			_hover: {
				border: "1px solid {colors.primary.default}",
				backgroundColor: "primary.default/12",
				color: "fg.default",
				opacity: 1,
				textDecoration: "none",
			},
		}),
		current: css({
			color: "fg.subtle",
			backgroundColor: "transparent",
			border: "1.5px solid {colors.secondary.default}",
			opacity: 0.4,
			textDecoration: "line-through",
			_hover: {
				border: "1.5px solid {colors.secondary.default}",
				backgroundColor: "secondary.default/12",
				color: "fg.default",
				opacity: 1,
				textDecoration: "none",
			},
		}),
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
// not a group-by: membership is one flat list in order and a section that
// appears twice in it is drawn twice, matching the order given. A set with no
// sections at all comes back as one null-section run, which renders as a
// plain ungrouped grid.
function sectionRuns<T extends { section: string | null }>(
	members: T[],
): { section: string | null; entries: { member: T; index: number }[] }[] {
	const runs: {
		section: string | null
		entries: { member: T; index: number }[]
	}[] = []
	members.forEach((member, index) => {
		const section = member.section
		const current = runs.at(-1)
		if (current && current.section === section)
			current.entries.push({ member, index })
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
	voided: css({
		border: "1px solid {colors.fg.subtle}",
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

export type QuestionSetMember = {
	key: string
	questionId: string
	questionTitle: string
	state: BallotMemberState
	// The chip's text in the grid.
	chipLabel: string
	// The prev/next box's text, and the chip's tooltip.
	navLabel: string
	// The small line above navLabel in a prev/next box.
	navKicker: string | null
	section: string | null
	// The viewer's points once the call has settled.
	points: number | null
	// The scorecard row's right-hand column while there are no points to show.
	listTrailing: string | null
	// What "next unanswered" names this member as.
	jumpLabel: string
}

// One chip in the grid above the nav. Extracted only because the grouped
// grid and the ungrouped wrapping row both render it - the rest of this file
// still styles inline at its single call site.
function SetChip({
	member,
	isCurrent,
}: {
	member: QuestionSetMember
	isCurrent: boolean
}) {
	return (
		<Link
			to="/questions/$questionId/{-$slug}"
			params={{
				questionId: member.questionId,
				slug: buildQuestionSlug(member.questionTitle),
			}}
			title={`${member.navLabel}: ${member.state}`}
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
				// Hover drops the state's own treatment rather than tinting it: a
				// dotted or struck-through chip at 0.4 opacity has nothing like
				// enough contrast left for a border change on its own to read.
				dotStateClass[member.state][isCurrent ? "current" : "default"],
			)}
		>
			{member.chipLabel}
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
	name: string
	icon: IconType
	// Names the set in the header control's aria label: "Show {this} navigation".
	navigationLabel: string
	// Says what the chips are ("8 official"), in place of the position count,
	// when the question on screen isn't one of them. Without it the grid has no
	// stated relationship to the page it's on.
	setSummary?: string
	// What the empty prev/next box says at either end.
	startLabel: string
	endLabel: string
	// In order.
	members: QuestionSetMember[]
	currentQuestionId: string
	// Sits at the end of the scorecard toggle's row, inside the collapsible
	// body: something to do with the set as a whole (sharing your picks on
	// it), not with the question on screen.
	action?: ReactNode
}

// Pure navigation/discovery over a set of independently-resolving questions
// (a ballot, a game's official questions). Each member's state is derived
// from the exact same fields the rest of the app already uses for won/lost
// (see ballot-member-state.ts), not a parallel state machine.
//
// The question on screen may not be a member (a community question on a
// game): the chips, scorecard and next-unanswered jump still show, but there
// is no position to count from, so no "N of M", no highlighted chip and no
// prev/next.
export function QuestionSetStrip({
	name,
	icon: Icon,
	navigationLabel,
	setSummary,
	startLabel,
	endLabel,
	members,
	currentQuestionId,
	action,
}: Props) {
	const [expanded, setExpanded] = useState(false)
	// null means "whatever this viewport defaults to" - closed on a phone,
	// where the strip is most of the screen, open on anything wider. That
	// default is expressed as CSS rather than as state so it survives server
	// rendering; a reader who touches the control replaces it with an explicit
	// true/false for the rest of the page's life.
	const [collapsedOverride, setCollapsed] = useState<boolean | null>(null)
	const isCompactViewport = useIsCompactViewport()
	const currentIndex = members.findIndex(
		(m) => m.questionId === currentQuestionId,
	)
	const isMember = currentIndex >= 0
	// A set the question on screen isn't part of starts closed at every width:
	// none of it is about what you're reading, so it stays a one-line header
	// naming the set until someone asks for the rest.
	const isCollapsed = collapsedOverride ?? (isMember ? isCompactViewport : true)
	const {
		prevIndex,
		nextIndex,
		nextUncalledIndex,
		resolvedCount,
		pendingCount,
		calledCount,
		wonCount,
	} = questionSetNavigation(
		members.map((m) => m.state),
		currentIndex,
	)
	const prev = prevIndex !== null ? members[prevIndex] : null
	const next = nextIndex !== null ? members[nextIndex] : null
	const nextUnanswered =
		nextUncalledIndex !== null ? members[nextUncalledIndex] : null
	const runs = sectionRuns(members)
	// Only resolved calls ever carry non-null points (see CallRef.totalPoints
	// in the API - null while any pick is still pending), so this is a plain sum
	// with no extra filtering needed.
	const totalPoints = members.reduce((sum, m) => sum + (m.points ?? 0), 0)

	// Written out per case rather than composed, so every rule Panda has to
	// extract is a literal it can see at build time.
	const bodyClass = match({ collapsedOverride, isMember })
		.with({ collapsedOverride: null, isMember: true }, () =>
			css({
				display: { base: "none", sm: "flex" },
				flexDirection: "column",
				gap: "3",
				alignItems: "stretch",
			}),
		)
		.with({ collapsedOverride: null, isMember: false }, () =>
			css({ display: "none" }),
		)
		.with({ collapsedOverride: true }, () => css({ display: "none" }))
		.with({ collapsedOverride: false }, () =>
			css({
				display: "flex",
				flexDirection: "column",
				gap: "3",
				alignItems: "stretch",
			}),
		)
		.exhaustive()

	const chevronClass = match({ collapsedOverride, isMember })
		.with({ collapsedOverride: null, isMember: true }, () =>
			css({ transform: { base: "rotate(0deg)", sm: "rotate(180deg)" } }),
		)
		.with({ collapsedOverride: null, isMember: false }, () =>
			css({ transform: "rotate(0deg)" }),
		)
		.with({ collapsedOverride: true }, () => css({ transform: "rotate(0deg)" }))
		.with({ collapsedOverride: false }, () =>
			css({ transform: "rotate(180deg)" }),
		)
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
							isCollapsed
								? `Show ${navigationLabel} navigation`
								: `Hide ${navigationLabel} navigation`
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
							<Icon size={15} className={css({ flexShrink: "0" })} />
							<span className={stripNameTextClass}>{name}</span>
						</span>
						<span
							className={css({
								display: "flex",
								alignItems: "center",
								gap: "2",
								flexShrink: "0",
							})}
						>
							{isMember ? (
								<span className={stripCountClass}>
									{currentIndex + 1} of {members.length}
								</span>
							) : (
								setSummary && (
									<span className={stripCountClass}>{setSummary}</span>
								)
							)}
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
						    widest section in the set, which on an All-Pro ballot
						    (9/5/6) squeezed a four-character slot into a cell too narrow
						    to hold it. An ungrouped set is one captionless run, which
						    collapses to a single full-width cluster: a plain wrapping
						    row. */}
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
											<SetChip
												key={member.key}
												member={member}
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
						    alongside it: how big this set is is worth knowing before
						    opening a scrolling list.

						    Its disclosure lives down here, not in the header: the
						    header's chevron collapses the whole strip, and two chevrons
						    side by side doing different things is exactly what made that
						    row confusing. */}
						<HStack gap="3" justify="space-between" alignItems="center">
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
							{action}
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
									const isCurrent = i === currentIndex
									// Same run boundaries the chip grid above breaks its lines
									// on, drawn here as a heading instead - the list is
									// scrollable and a title alone ("Boston Celtics' win
									// total") doesn't say which group it sits in.
									const startsSection =
										member.section && member.section !== members[i - 1]?.section
									return (
										<Fragment key={member.key}>
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
													questionId: member.questionId,
													slug: buildQuestionSlug(member.questionTitle),
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
												<MemberStateIcon state={member.state} />
												<span
													className={css({
														fontSize: "xs",
														color: isCurrent ? "fg.default" : "fg.subtle",
														fontWeight: isCurrent ? "medium" : undefined,
														opacity:
															member.state === "missed" ? 0.55 : undefined,
														flex: "1",
														minWidth: "0",
														overflow: "hidden",
														textOverflow: "ellipsis",
														whiteSpace: "nowrap",
													})}
												>
													{member.questionTitle}
												</span>
												{member.points !== null ? (
													<span
														className={cx(
															listSlotClass,
															css({
																color:
																	member.points >= 0
																		? "success.default"
																		: "danger.default",
															}),
														)}
													>
														{member.points >= 0 ? "+" : "−"}
														{Math.abs(member.points)}
													</span>
												) : (
													<span className={listSlotClass}>
														{member.listTrailing}
													</span>
												)}
											</Link>
										</Fragment>
									)
								})}
							</VStack>
						)}

						{isMember && (
							<HStack gap="2" alignItems="stretch">
								{prev ? (
									<Link
										to="/questions/$questionId/{-$slug}"
										params={{
											questionId: prev.questionId,
											slug: buildQuestionSlug(prev.questionTitle),
										}}
										className={cx(navBoxClass, navBoxLinkClass)}
									>
										<FiChevronLeft className={navArrowClass} />
										<span className={navTextClass}>
											{prev.navKicker && (
												<span className={navSlotClass}>{prev.navKicker}</span>
											)}
											<span className={navLabelClass}>{prev.navLabel}</span>
										</span>
									</Link>
								) : (
									<div className={cx(navBoxClass, navBoxEmptyClass)}>
										<span className={emptyNavTextClass}>{startLabel}</span>
									</div>
								)}
								{next ? (
									<Link
										to="/questions/$questionId/{-$slug}"
										params={{
											questionId: next.questionId,
											slug: buildQuestionSlug(next.questionTitle),
										}}
										className={cx(
											navBoxClass,
											navBoxLinkClass,
											css({ justifyContent: "flex-end", textAlign: "right" }),
										)}
									>
										<span className={navTextClass}>
											{next.navKicker && (
												<span className={navSlotClass}>{next.navKicker}</span>
											)}
											<span className={navLabelClass}>{next.navLabel}</span>
										</span>
										<FiChevronRight className={navArrowClass} />
									</Link>
								) : (
									<div className={cx(navBoxClass, navBoxEmptyClass)}>
										<span className={emptyNavTextClass}>{endLabel}</span>
									</div>
								)}
							</HStack>
						)}

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
									questionId: nextUnanswered.questionId,
									slug: buildQuestionSlug(nextUnanswered.questionTitle),
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
									next unanswered: {nextUnanswered.jumpLabel}
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
