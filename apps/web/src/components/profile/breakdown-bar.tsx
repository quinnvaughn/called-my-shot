import { css } from "styled-system/css"
import { Flex, VStack } from "styled-system/jsx"
import { formatConvictionEdge } from "#/components/profile/stat-grid"

type Props = {
	label: string
	accuracy: number | null
	convictionEdge: number | null
	resolvedCallCount: number
}

export function BreakdownBar({
	label,
	accuracy,
	convictionEdge,
	resolvedCallCount,
}: Props) {
	const pct = accuracy !== null ? Math.round(accuracy) : null
	return (
		<VStack
			gap="2"
			alignItems="stretch"
			className={css({
				background: "card",
				border: "1px solid {colors.border.default}",
				borderRadius: "md",
				padding: "3",
			})}
		>
			{/*
			 * Stacked on mobile, one line from sm up. Side-by-side at every
			 * width made each row's height depend on how long its shape's name
			 * happened to be - a short label kept both halves on one line, a
			 * long one wrapped both across two or three, so a list of shapes
			 * came out visibly ragged. Stacking gives every row the same two
			 * lines regardless of label length.
			 */}
			<Flex
				direction={{ base: "column", sm: "row" }}
				justify="space-between"
				alignItems={{ base: "flex-start", sm: "center" }}
				gap={{ base: "0.5", sm: "3" }}
				fontSize="sm"
			>
				<span className={css({ fontWeight: "medium" })}>{label}</span>
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						color: "fg.muted",
						// One unbreakable run, so it can never split "15" onto one
						// line and "resolved" onto the next.
						whiteSpace: "nowrap",
					})}
				>
					{pct !== null ? `${pct}%` : "-"} ·{" "}
					{convictionEdge !== null && (
						// Dropped entirely rather than shown as a dash on the shapes
						// below MIN_EDGE_SAMPLE - per-shape volume is a fraction of a
						// caller's total, so a dash here would be the common case and
						// would read as a broken stat rather than a locked one.
						<>{formatConvictionEdge(convictionEdge)} edge · </>
					)}
					{resolvedCallCount} resolved
				</span>
			</Flex>
			<div
				className={css({
					background: "bg.subtle",
					borderRadius: "sm",
					height: "1.5",
					overflow: "hidden",
				})}
			>
				<div
					className={css({
						// Matches the win/loss color convention already used for
						// individual calls (see ResultBadge) - >=50% reads as a
						// net-positive category, below reads as net-negative. No
						// accuracy yet stays neutral rather than reading as a loss.
						background:
							pct === null
								? "fg.subtle"
								: pct >= 50
									? "success.vibrant"
									: "danger.default",
						height: "full",
					})}
					style={{ width: `${pct ?? 0}%` }}
				/>
			</div>
		</VStack>
	)
}
