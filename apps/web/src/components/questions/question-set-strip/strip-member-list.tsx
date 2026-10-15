import { Link } from "@tanstack/react-router"
import { Fragment, type ReactNode, useState } from "react"
import { FaChevronDown } from "react-icons/fa6"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { MemberStateIcon } from "#/components/questions/member-state-icon"
import { SignedPoints } from "#/components/ui/signed-points"
import { buildQuestionSlug } from "#/lib/slug"
import { stripCountClass } from "./styles"
import type { QuestionSetMember } from "./types"

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

// Shared by the points and no-points versions of a row's right-hand column.
const listSlotClass = css({
	fontFamily: "mono",
	fontSize: "3xs",
	letterSpacing: "wide",
	color: "fg.subtle",
	flexShrink: "0",
})

// The scorecard: every member as a row, behind its own toggle.
//
// Named for what the rows are read for - call state, correctness, points -
// rather than for what the list contains, which the chip grid above already
// shows. The count stays alongside it: how big this set is is worth knowing
// before opening a scrolling list.
//
// Its disclosure lives down here, not in the header: the header's chevron
// collapses the whole strip, and two chevrons side by side doing different
// things is exactly what made that row confusing.
export function StripMemberList({
	members,
	currentIndex,
	action,
}: {
	members: QuestionSetMember[]
	currentIndex: number
	// Sits at the end of the toggle's row.
	action?: ReactNode
}) {
	const [expanded, setExpanded] = useState(false)

	return (
		<>
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
											textStyle: "meta",
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
											opacity: member.state === "missed" ? 0.55 : undefined,
											flex: "1",
											minWidth: "0",
											truncate: true,
										})}
									>
										{member.questionTitle}
									</span>
									{member.points !== null ? (
										<SignedPoints
											value={member.points}
											zeroSign
											className={listSlotClass}
										/>
									) : (
										<span className={listSlotClass}>{member.listTrailing}</span>
									)}
								</Link>
							</Fragment>
						)
					})}
				</VStack>
			)}
		</>
	)
}
