import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import type { ChallengePointsRange } from "#/lib/challenge"
import { formatSigned } from "#/lib/format-number"

export type Result = "won" | "lost" | "draw" | null

export type Side = {
	label: string
	points: number
	// What this side still has riding on the questions that haven't settled.
	open?: ChallengePointsRange | null
}

const openValue = css({ fontWeight: "bold" })

export function SideTile({
	label,
	points,
	open,
	result,
}: Side & { result: Result }) {
	return (
		<VStack
			gap="2"
			alignItems="flex-start"
			className={css({
				padding: "4",
				borderRadius: "lg",
				border:
					result === "won"
						? "1px solid {colors.success.default}"
						: "1px solid {colors.border.default}",
				backgroundColor: result === "won" ? "success.subtle" : "bg.subtle",
				minWidth: "0",
			})}
		>
			<HStack gap="2" justify="space-between" width="full">
				<span
					className={css({
						textStyle: "sectionHeading",
						color: "fg.muted",
						truncate: true,
					})}
				>
					{label}
				</span>
				{result && (
					<span
						className={css({
							textStyle: "sectionHeading",
							fontWeight: "bold",
							flexShrink: 0,
							color:
								result === "won"
									? "success.default"
									: result === "lost"
										? "danger.default"
										: "fg.muted",
						})}
					>
						{result === "won" ? "Won" : result === "lost" ? "Lost" : "Draw"}
					</span>
				)}
			</HStack>
			<span
				className={css({
					fontFamily: "heading",
					fontSize: { base: "2xl", md: "3xl" },
					lineHeight: "1",
					color:
						result === "won"
							? "success.default"
							: result === "lost"
								? "fg.muted"
								: "fg.default",
				})}
			>
				{formatSigned(points)} pts
			</span>
			{open && !result && (
				<VStack
					gap="0.5"
					alignItems="flex-start"
					className={css({
						textStyle: "metaLg",
						color: "fg.muted",
					})}
				>
					<span>
						<span className={cx(openValue, css({ color: "success.default" }))}>
							{open.winLow === open.winHigh
								? `+${open.winLow}`
								: `+${open.winLow} to +${open.winHigh}`}
						</span>{" "}
						if every open call hits
					</span>
					<span>
						<span className={cx(openValue, css({ color: "danger.default" }))}>
							−{open.lose}
						</span>{" "}
						if every open call misses
					</span>
				</VStack>
			)}
		</VStack>
	)
}
