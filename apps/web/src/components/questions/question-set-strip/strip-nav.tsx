import { Link } from "@tanstack/react-router"
import { FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { buildQuestionSlug } from "#/lib/slug"
import type { QuestionSetMember } from "./types"

// The prev and next boxes share these; everything else is styled inline at
// the one spot it's used, matching pick-state-icon.tsx/locked-badge.tsx
// elsewhere in this directory.
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

const navBoxLinkClass = css({
	_hover: { border: "1px solid {colors.border.emphasized}" },
})
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
	textStyle: "labelSm",
	color: "fg.subtle",
	truncate: true,
})

const navLabelClass = css({
	fontSize: "xs",
	color: "fg.body",
	truncate: true,
})

const emptyNavTextClass = css({
	textStyle: "meta",
	color: "fg.subtle",
})

// The neighbors of the question on screen, or what the set says at either
// end.
export function StripNav({
	prev,
	next,
	startLabel,
	endLabel,
}: {
	prev: QuestionSetMember | null
	next: QuestionSetMember | null
	startLabel: string
	endLabel: string
}) {
	return (
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
	)
}
