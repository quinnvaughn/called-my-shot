import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { BallotCard } from "#/components/ballots/ballot-card"
import { QuestionCard } from "#/components/questions/question-card"
import { EmptyState } from "#/components/ui/empty-state"
import { LeagueSeasonDocument } from "#/graphql/queries/sports"

export const Route = createFileRoute("/_app/leagues/$leagueId/season")({
	component: RouteComponent,
	staleTime: 0,
	loader: async ({ context, params }) => {
		const { data } = await context.apolloClient.query({
			query: LeagueSeasonDocument,
			variables: { leagueId: params.leagueId },
			fetchPolicy: "network-only",
		})
		return {
			ballots: data?.leagueBallots ?? [],
			singles: data?.questions.items ?? [],
		}
	},
})

function RouteComponent() {
	const { ballots, singles } = Route.useLoaderData()

	if (ballots.length === 0 && singles.length === 0) {
		return (
			<EmptyState>
				No season questions yet. They open closer to the season.
			</EmptyState>
		)
	}

	return (
		<VStack gap="3" alignItems="stretch">
			{ballots.map((ballot) => (
				<BallotCard key={ballot.id} ballot={ballot} />
			))}
			{singles.map((question) => (
				<QuestionCard key={question.id} question={question} />
			))}
		</VStack>
	)
}
