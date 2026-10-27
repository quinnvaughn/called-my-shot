import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { BlindRankHubCard } from "#/components/arcade/blind-rank/blind-rank-hub-card"
import { NameThatSeasonHubCard } from "#/components/arcade/name-that-season/name-that-season-hub-card"
import { TeammateChainHubCard } from "#/components/arcade/teammate-chain/teammate-chain-hub-card"
import { PageHeader } from "#/components/ui/page-header"
import { rankPuzzleTodayQuery } from "#/graphql/blind-rank/queries"
import { seasonPuzzleTodayQuery } from "#/graphql/season-puzzles/queries"
import { teammateChainTodayQuery } from "#/graphql/teammate-chain/queries"
import { pageMeta } from "#/lib/meta"

export const Route = createFileRoute("/_app/arcade/")({
	component: RouteComponent,
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.query(seasonPuzzleTodayQuery),
			context.queryClient.query(rankPuzzleTodayQuery),
			context.queryClient.query(teammateChainTodayQuery),
		]),
	// Today's puzzle for each game on the preview, so a link pasted in a chat
	// says what's up today, not just which games exist.
	head: ({ loaderData }) => {
		const season = loaderData?.[0].seasonPuzzleToday
		const rank = loaderData?.[1].rankPuzzleToday
		const chain = loaderData?.[2].teammateChainToday
		return pageMeta({
			title: "Arcade: Sports Games · Called My Shot",
			description: [
				"Sports games and puzzles, free to play.",
				season
					? `Name That Season: today's is an ${season.league.abbreviation} season. Name the team and the year from six clues.`
					: "Name That Season: name the team and the year from six clues.",
				rank
					? `Blind Rank: today's ranking is ${rank.prompt} · ${rank.context}. Five of them, one at a time, no moving them once placed.`
					: "Blind Rank: rank five things one at a time, with no moving them once placed.",
				chain
					? `Teammate Chain: today's is ${chain.start.player.name} to ${chain.target.player.name}. Connect them through teammates in as few links as you can.`
					: "Teammate Chain: connect two players through teammates in as few links as you can.",
			].join(" "),
			path: "/arcade",
		})
	},
})

function RouteComponent() {
	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader title="Arcade" subtitle="Sports games" />
			<NameThatSeasonHubCard />
			<BlindRankHubCard />
			<TeammateChainHubCard />
		</VStack>
	)
}
