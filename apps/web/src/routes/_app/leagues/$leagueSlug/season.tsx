import { createFileRoute } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { BallotCard } from "#/components/ballots/ballot-card"
import { QuestionCard } from "#/components/questions/question-card"
import { EmptyState } from "#/components/ui/empty-state"
import { LeagueSeasonDocument } from "#/graphql/queries/sports"

export const Route = createFileRoute("/_app/leagues/$leagueSlug/season")({
	component: RouteComponent,
	staleTime: 0,
	loader: async ({ context }) => {
		const { data } = await context.apolloClient.query({
			query: LeagueSeasonDocument,
			variables: { leagueId: context.league.id },
			fetchPolicy: "network-only",
		})
		return {
			ballots: data?.leagueBallots ?? [],
			singles: data?.questions.items ?? [],
		}
	},
})

const subHeadClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	color: "fg.subtle",
	textTransform: "uppercase",
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
		<VStack gap="6" alignItems="stretch">
			{ballots.length > 0 && (
				<VStack gap="3" alignItems="stretch">
					<span className={subHeadClass}>Ballots</span>
					<VStack gap="3" alignItems="stretch">
						{ballots.map((ballot) => (
							<BallotCard key={ballot.id} ballot={ballot} />
						))}
					</VStack>
				</VStack>
			)}
			{singles.length > 0 && (
				<VStack gap="3" alignItems="stretch">
					<span className={subHeadClass}>Awards &amp; Championships</span>
					<VStack gap="3" alignItems="stretch">
						{singles.map((question) => (
							<QuestionCard key={question.id} question={question} />
						))}
					</VStack>
				</VStack>
			)}
		</VStack>
	)
}
