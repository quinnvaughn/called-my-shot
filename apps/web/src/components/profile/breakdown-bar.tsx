import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"

type Props = {
	label: string
	accuracy: number | null
	resolvedCallCount: number
}

export function BreakdownBar({ label, accuracy, resolvedCallCount }: Props) {
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
			<HStack justify="space-between" fontSize="sm">
				<span className={css({ fontWeight: "medium" })}>{label}</span>
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						color: "fg.muted",
					})}
				>
					{pct !== null ? `${pct}%` : "-"} · {resolvedCallCount} resolved
				</span>
			</HStack>
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
