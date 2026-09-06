import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { BallotCard } from "#/components/ballots/ballot-card"
import { QuestionCard } from "#/components/questions/question-card"
import { EmptyState } from "#/components/ui/empty-state"
import { LeagueSeasonDocument } from "#/graphql/queries/sports"
import { gqlQueryOptions } from "#/graphql/query-options"
import { pageMeta } from "#/lib/meta"

const leagueSeasonQuery = (leagueId: string) =>
	gqlQueryOptions(LeagueSeasonDocument, { leagueId })

export const Route = createFileRoute("/_app/leagues/$leagueSlug/season")({
	component: RouteComponent,
	staleTime: 0,
	loader: ({ context }) =>
		context.queryClient.query(leagueSeasonQuery(context.league.id)),
	head: ({ match }) => {
		const league = match.context.league
		return pageMeta({
			title: `${league.name} · Season · Called My Shot`,
			description: `${league.name} season-long calls - award races, championship futures, and the ballots behind them.`,
			path: `/leagues/${league.slug}/season`,
		})
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
	const { league } = Route.useRouteContext()
	const { data } = useSuspenseQuery(leagueSeasonQuery(league.id))
	const ballots = data.leagueBallots
	const singles = data.questions.items

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
