import { Link } from "@tanstack/react-router"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { MemberStateIcon } from "#/components/questions/member-state-icon"
import type { QuestionSetRailRow } from "#/lib/question-set-rail"
import { buildQuestionSlug } from "#/lib/slug"
import { monoSmall, TONE_COLOR } from "./rail-styles"
import { RowStanding } from "./row-standing"

// One finished class per row kind: the current row swaps the
// left border, and Panda only emits what it sees literally inside css().
const rowClass = {
	default: css({
		display: "block",
		paddingBlock: "2.5",
		paddingInline: "4",
		textDecoration: "none",
		color: "inherit",
		borderLeft: "2px solid transparent",
		_hover: { bg: "bg.subtle" },
	}),
	current: css({
		display: "block",
		paddingBlock: "2.5",
		paddingInline: "4",
		textDecoration: "none",
		color: "inherit",
		borderLeft: "2px solid {colors.secondary.default}",
		bg: "secondary.default/8",
		_hover: { bg: "secondary.default/12" },
	}),
}

export function RailRow({
	row,
	isCurrent,
}: {
	row: QuestionSetRailRow
	isCurrent: boolean
}) {
	return (
		<Link
			to="/questions/$questionId/{-$slug}"
			params={{
				questionId: row.questionId,
				slug: buildQuestionSlug(row.questionTitle),
			}}
			aria-current={isCurrent ? "page" : undefined}
			className={rowClass[isCurrent ? "current" : "default"]}
		>
			{/* Stacked rather than split into columns: at the rail's width a
			    column of numbers beside the label leaves the label half of it. */}
			<HStack gap="2.5" alignItems="flex-start">
				<div className={css({ paddingTop: "1" })}>
					<MemberStateIcon state={row.state} />
				</div>
				<VStack gap="0.5" alignItems="stretch" flex="1" minWidth="0">
					<span
						className={cx(
							css({ fontSize: "sm", fontWeight: "semibold" }),
							row.call ? TONE_COLOR.default : TONE_COLOR.muted,
						)}
					>
						{row.label}
					</span>
					<HStack
						justify="space-between"
						alignItems="baseline"
						gap="2"
						flexWrap="wrap"
					>
						<span className={monoSmall}>
							{row.call
								? row.call.pick
								: row.state === "uncalled"
									? "Not called yet"
									: "Not called"}
						</span>
						<RowStanding row={row} />
					</HStack>
				</VStack>
			</HStack>
		</Link>
	)
}
