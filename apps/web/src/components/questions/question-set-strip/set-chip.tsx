import { Link } from "@tanstack/react-router"
import { css, cx } from "styled-system/css"
import type { BallotMemberState } from "#/lib/ballot-member-state"
import { buildQuestionSlug } from "#/lib/slug"
import type { QuestionSetMember } from "./types"

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

// One chip in the grid above the nav.
export function SetChip({
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
