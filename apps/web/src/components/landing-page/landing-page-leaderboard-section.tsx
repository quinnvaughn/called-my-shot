import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { type FragmentType, useFragment } from "#/graphql/generated"
import { LeaderboardEntryFragment } from "#/graphql/leaderboard/queries"
import { toIdentity } from "#/lib/identity"
import { initials } from "#/lib/initials"
import { LandingPageContentSection } from "./landing-page-content-section"
import { type LeaderboardRow, LeaderboardRowItem } from "./leaderboard-row-item"

type Props = {
	entries: FragmentType<typeof LeaderboardEntryFragment>[]
}

export function LandingPageLeaderboardSection({ entries: entriesProp }: Props) {
	const entries = useFragment(LeaderboardEntryFragment, entriesProp)

	if (entries.length === 0) {
		return null
	}

	// leaderboard items are ranked rows only; the shared fragment just can't
	// say so, since the viewer's own entry uses it too
	const rows: (LeaderboardRow & { rank: number })[] = entries.flatMap(
		(entry) => {
			if (entry.rank === null) return []
			const user = toIdentity(entry.user)
			return [
				{
					rank: entry.rank,
					initials: initials(user.name.trim() || user.username),
					username: `@${user.username}`,
					accuracy: Math.round(entry.accuracy ?? 0),
					points: entry.totalPoints,
				},
			]
		},
	)

	return (
		<LandingPageContentSection
			id="leaderboard"
			alt
			eyebrow="The leaderboards"
			title="A board you can actually top."
			description="The overall board, each league's standings for this season and all time, and your group's private board all run on the same points. A group board is just these rows filtered to the people you invited, so you can sit mid-pack here and still run your group chat."
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
						border: "1px solid {colors.border.default}",
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
