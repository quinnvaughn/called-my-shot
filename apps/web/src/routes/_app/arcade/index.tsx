import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { BlindRankHubCard } from "#/components/arcade/blind-rank/blind-rank-hub-card"
import { NameThatSeasonHubCard } from "#/components/arcade/name-that-season/name-that-season-hub-card"
import { PageHeader } from "#/components/ui/page-header"
import { rankPuzzleTodayQuery } from "#/graphql/blind-rank/queries"
import { seasonPuzzleTodayQuery } from "#/graphql/season-puzzles/queries"
import { pageMeta } from "#/lib/meta"

export const Route = createFileRoute("/_app/arcade/")({
	component: RouteComponent,
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.query(seasonPuzzleTodayQuery),
			context.queryClient.query(rankPuzzleTodayQuery),
		]),
	head: () =>
		pageMeta({
			title: "Arcade · Called My Shot",
			description:
				"Sports games to play: Name That Season and Blind Rank.",
			path: "/arcade",
		}),
})

function RouteComponent() {
	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader title="Arcade" subtitle="Sports games" />
			<NameThatSeasonHubCard />
			<BlindRankHubCard />
		</VStack>
	)
}
