import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { avatarStyle } from "#/components/ui/avatar"

export type LeaderboardRow = {
	initials: string
	username: string
	accuracy: number
	points: number
}

export function LeaderboardRowItem({
	rank,
	initials,
	username,
	accuracy,
	points,
}: LeaderboardRow & { rank: number }) {
	return (
		<HStack
			gap="3.5"
			alignItems="center"
			padding="{spacing.3.5} {spacing.5}"
			borderTop={rank > 1 ? "1px solid {border.default}" : undefined}
		>
			<div
				className={cx(
					css({
						fontFamily: "heading",
						fontSize: "md",
						width: "6",
						flexShrink: "0",
						color: "fg.subtle",
					}),
					rank === 1 && css({ color: "primary.default" }),
				)}
			>
				{rank}
			</div>
			<div className={avatarStyle({ size: "sm" })}>{initials}</div>
			<VStack gap="0.5" alignItems="flex-start" flex="1" minWidth="0">
				<div className={css({ fontSize: "sm", fontWeight: "medium" })}>
					{username}
				</div>
				<div
					className={css({
						textStyle: "metaLg",
						color: "secondary.default",
					})}
				>
					{accuracy}% accuracy
				</div>
			</VStack>
			<VStack gap="0.5" alignItems="flex-end" flexShrink="0">
				<div className={css({ fontFamily: "heading", fontSize: "sm" })}>
					{points.toLocaleString()}
				</div>
				<div
					className={css({
						textStyle: "metaLg",
						color: "fg.subtle",
					})}
				>
					pts
				</div>
			</VStack>
		</HStack>
	)
}
