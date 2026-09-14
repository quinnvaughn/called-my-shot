import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { Tag } from "#/components/ui/tag"
import {
	milestoneNudge,
	type StreakFamilyValue,
	streakFamilyParam,
} from "#/lib/streak-meta"

export type StreakRow = {
	league: { id: string; abbreviation: string; slug: string }
	family: StreakFamilyValue
	familyLabel: string
	currentLength: number
	bestLength: number
	nextMilestone: number
}

type Props = {
	username: string
	// Hottest first, as User.streaks returns them.
	streaks: StreakRow[]
	// The milestone nudge is only shown to the person whose runs these are.
	isOwn: boolean
	// Off inside a league's own accordion, where the league goes without saying.
	showLeague?: boolean
	// "grid" is the profile's top row of live runs; "list" is every track.
	layout?: "list" | "grid"
}

// One card per league-and-family track, each linking to its streak page.
export function StreaksSection({
	username,
	streaks,
	isOwn,
	showLeague = true,
	layout = "list",
}: Props) {
	const cards = streaks.map((streak) => {
		const nudge = isOwn
			? milestoneNudge(streak.currentLength, streak.nextMilestone)
			: null
		const going = streak.currentLength > 0
		const name = (
			<HStack gap="2" alignItems="center">
				{showLeague && <Tag size="sm">{streak.league.abbreviation}</Tag>}
				<span className={css({ fontSize: "sm", fontWeight: "semibold" })}>
					{streak.familyLabel}
				</span>
			</HStack>
		)
		const run = (
			<span
				className={css({
					fontFamily: "heading",
					fontSize: "lg",
					color: going ? "fg.default" : "fg.muted",
				})}
			>
				{going ? `${streak.currentLength} in a row` : "Run ended"}
			</span>
		)
		const best = (
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					textTransform: "uppercase",
					color: "fg.subtle",
				})}
			>
				Best {streak.bestLength}
			</span>
		)
		const nudgeLine = nudge && (
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					color: "success.default",
				})}
			>
				{nudge}
			</span>
		)

		return (
			<Link
				key={`${streak.league.id}-${streak.family}`}
				to="/user/$username/streaks/$league/$family"
				params={{
					username,
					league: streak.league.slug,
					family: streakFamilyParam(streak.family),
				}}
				className={css({
					display: "block",
					textDecoration: "none",
					color: "inherit",
				})}
			>
				<Card size="sm" interactive>
					<Card.Body>
						{layout === "grid" ? (
							<VStack gap="1.5" alignItems="flex-start">
								{name}
								{run}
								<HStack gap="2" alignItems="baseline" flexWrap="wrap">
									{best}
									{nudgeLine}
								</HStack>
							</VStack>
						) : (
							<HStack justify="space-between" alignItems="center" gap="3">
								<VStack gap="1" alignItems="flex-start" minWidth="0">
									{name}
									{nudgeLine}
								</VStack>
								<HStack gap="3" alignItems="baseline" flexShrink="0">
									{run}
									{best}
								</HStack>
							</HStack>
						)}
					</Card.Body>
				</Card>
			</Link>
		)
	})

	return layout === "grid" ? (
		<div
			className={css({
				display: "grid",
				gap: "2",
				gridTemplateColumns: {
					base: "1fr",
					md: "repeat(auto-fill, minmax(220px, 1fr))",
				},
			})}
		>
			{cards}
		</div>
	) : (
		<VStack alignItems="stretch" gap="2">
			{cards}
		</VStack>
	)
}
