import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { LandingPageContentSection } from "./landing-page-content-section"

type LeaderboardRow = {
	initials: string
	username: string
	accuracy: number
	points: number
}

const rows: LeaderboardRow[] = [
	{ initials: "DK", username: "@dkanalytics", accuracy: 64, points: 28110 },
	{ initials: "MP", username: "@mpendzone", accuracy: 52, points: 24200 },
	{ initials: "JR", username: "@jrhoops", accuracy: 68, points: 21940 },
	{ initials: "SL", username: "@statlord", accuracy: 61, points: 19655 },
	{ initials: "RS", username: "@rsidelines", accuracy: 57, points: 17310 },
]

export function LandingPageLeaderboardSection() {
	return (
		<LandingPageContentSection
			id="leaderboard"
			alt
			eyebrow="The leaderboard"
			title="Being right, on the record."
			description="Points and accuracy are tracked in the open. This is what actually being good at this looks like: no way to fake it."
		>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					width: "full",
					borderRadius: "2xl",
					border: "1px solid",
					borderColor: "border.default",
					overflow: "hidden",
					bg: "bg.surface",
				})}
			>
				{rows.map((row, index) => (
					<LeaderboardRowItem {...row} rank={index + 1} key={row.username} />
				))}
			</div>
		</LandingPageContentSection>
	)
}

function LeaderboardRowItem({
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
			<div
				className={css({
					width: "8",
					height: "8",
					borderRadius: "full",
					bg: "bg.subtle",
					border: "1px solid",
					borderColor: "border.default",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					fontFamily: "mono",
					fontSize: "xs",
					color: "fg.muted",
					flexShrink: "0",
				})}
			>
				{initials}
			</div>
			<VStack gap="0.5" alignItems="flex-start" flex="1" minWidth="0">
				<div className={css({ fontSize: "sm", fontWeight: "medium" })}>
					{username}
				</div>
				<div
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						color: "success.default",
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
						fontFamily: "mono",
						fontSize: "xs",
						color: "fg.subtle",
					})}
				>
					pts
				</div>
			</VStack>
		</HStack>
	)
}
