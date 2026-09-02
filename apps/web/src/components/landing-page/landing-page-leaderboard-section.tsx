import { Link } from "@tanstack/react-router"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { type FragmentType, useFragment } from "#/graphql/generated"
import { LeaderboardEntryFragment } from "#/graphql/queries/leaderboard"
import { LandingPageContentSection } from "./landing-page-content-section"

type LeaderboardRow = {
	initials: string
	username: string
	accuracy: number
	points: number
}

type Props = {
	entries: FragmentType<typeof LeaderboardEntryFragment>[]
}

function initialsFor(name: string, username: string) {
	const source = name.trim() || username
	const parts = source.split(/\s+/).filter(Boolean)
	const letters =
		parts.length > 1
			? `${parts[0][0]}${parts[parts.length - 1][0]}`
			: source.slice(0, 2)
	return letters.toUpperCase()
}

export function LandingPageLeaderboardSection({ entries: entriesProp }: Props) {
	const entries = useFragment(LeaderboardEntryFragment, entriesProp)

	if (entries.length === 0) {
		return null
	}

	const rows: (LeaderboardRow & { rank: number })[] = entries.map((entry) => ({
		rank: entry.rank,
		initials: initialsFor(entry.user.name, entry.user.username),
		username: `@${entry.user.username}`,
		accuracy: Math.round(entry.accuracy ?? 0),
		points: entry.totalPoints,
	}))

	return (
		<LandingPageContentSection
			id="leaderboard"
			alt
			eyebrow="The leaderboard"
			title="Being right, on the record."
			description="Points and accuracy are tracked in the open. This is what actually being good at this looks like: no way to fake it."
		>
			<VStack
				gap="6"
				alignItems={{ base: "stretch", sm: "flex-start" }}
				width="full"
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
					{rows.map((row) => (
						<LeaderboardRowItem {...row} key={row.username} />
					))}
				</div>
				<Link
					to="/leaderboard"
					className={button({ variant: "ghost", size: "md" })}
				>
					See the live leaderboard →
				</Link>
			</VStack>
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
