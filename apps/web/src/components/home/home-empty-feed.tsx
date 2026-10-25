import { useQuery } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { PostFeed } from "#/components/posts/post-feed"
import { SpaceLeagueRow } from "#/components/spaces/space-league-row"
import { Card } from "#/components/ui/card"
import { EmptyState } from "#/components/ui/empty-state"
import { myFollowsQuery } from "#/graphql/follows/queries"
import type { LeaguesQuery } from "#/graphql/generated/graphql"
import { popularRushmoresQuery } from "#/graphql/posts/queries"
import { HomeSectionLabel } from "./home-section-label"

// Home's feed with nothing in it yet: the leagues to follow, then the
// most-liked franchise Rushmores so there's something to read and argue with
// in the meantime.
export function HomeEmptyFeed({
	leagues,
}: {
	leagues: LeaguesQuery["leagues"]
}) {
	// Loaded by _app for a signed-in viewer.
	const { data } = useQuery(myFollowsQuery)
	const followedIds = new Set(
		(data?.myFollows.leagues ?? []).map((league) => league.id),
	)

	return (
		<VStack gap="8" alignItems="stretch">
			<VStack gap="3" alignItems="stretch">
				<HomeSectionLabel>Follow a league</HomeSectionLabel>
				<p className={css({ fontSize: "sm", color: "fg.muted" })}>
					Posts tagged to the leagues, teams and people you follow show up here.
					Each league's Teams tab has a follow button for every team.
				</p>
				<Card>
					{leagues.map((league) => (
						<SpaceLeagueRow
							key={league.id}
							league={league}
							following={followedIds.has(league.id)}
						/>
					))}
				</Card>
			</VStack>
			<VStack gap="3" alignItems="stretch">
				<HomeSectionLabel>Popular Rushmores</HomeSectionLabel>
				<PostFeed
					query={popularRushmoresQuery()}
					empty={
						<EmptyState>
							No Rushmores yet. Tap Create to post the first one.
						</EmptyState>
					}
				/>
			</VStack>
		</VStack>
	)
}
