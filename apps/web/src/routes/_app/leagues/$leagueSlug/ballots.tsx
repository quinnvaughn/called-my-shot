import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { BallotCard } from "#/components/ballots/ballot-card"
import { QuestionCard } from "#/components/questions/question-card"
import { EmptyState } from "#/components/ui/empty-state"
import { LeagueBallotsDocument } from "#/graphql/queries/sports"
import { gqlQueryOptions } from "#/graphql/query-options"
import { pageMeta } from "#/lib/meta"

const leagueBallotsQuery = (leagueId: string) =>
	gqlQueryOptions(LeagueBallotsDocument, { leagueId })

export const Route = createFileRoute("/_app/leagues/$leagueSlug/ballots")({
	component: RouteComponent,
	staleTime: 0,
	loader: ({ context }) =>
		context.queryClient.query(leagueBallotsQuery(context.league.id)),
	head: ({ match }) => {
		const league = match.context.league
		return pageMeta({
			title: `${league.name} · Ballots · Called My Shot`,
			description: `${league.name} award races, win totals and championships, and the ballots behind them.`,
			path: `/leagues/${league.slug}/ballots`,
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
	const { data } = useSuspenseQuery(leagueBallotsQuery(league.id))
	const ballots = data.leagueBallots
	const singles = data.questions.items

	if (ballots.length === 0 && singles.length === 0) {
		return (
			<EmptyState>No ballots yet. They open closer to the season.</EmptyState>
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
