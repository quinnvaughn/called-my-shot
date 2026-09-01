import { createFileRoute } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { Grid, VStack } from "styled-system/jsx"
import { LeagueRoomCard } from "#/components/home/league-room-card"
import { QuestionCard } from "#/components/questions/question-card"
import { EmptyState } from "#/components/ui/empty-state"
import { PageHeader } from "#/components/ui/page-header"
import { HomeDashboardDocument } from "#/graphql/queries/home"

function SectionLabel({ children }: { children: ReactNode }) {
	return (
		<h2
			className={css({
				fontFamily: "mono",
				fontSize: "2xs",
				letterSpacing: "wide",
				textTransform: "uppercase",
				color: "fg.muted",
			})}
		>
			{children}
		</h2>
	)
}

export const Route = createFileRoute("/_app/_authed/home")({
	component: RouteComponent,
	loader: async ({ context }) => {
		const { data } = await context.apolloClient.query({
			query: HomeDashboardDocument,
		})
		return {
			leagues: data?.leagues ?? [],
			lockingSoon: data?.questions.items ?? [],
			justResolved: data?.myRecentResolvedCalls ?? [],
		}
	},
})

// Deliberately ranks nothing and grows with nothing - no MOST_CALLED/NEW sort, no
// question list that scales with the catalogue. League cards are counts;
// the two lists below are bounded by a time horizon, not by how many
// questions exist (see HomeDashboardDocument). This is a checklist of what's
// actionable right now, not a feed - that lives in each league's Feed tab.
function RouteComponent() {
	const { leagues, lockingSoon, justResolved } = Route.useLoaderData()

	return (
		<VStack gap="8" alignItems="stretch">
			<PageHeader
				title="Home"
				subtitle="Where things are and what's about to lock"
			/>

			<VStack gap="3" alignItems="stretch">
				<SectionLabel>Leagues</SectionLabel>
				<Grid
					gridTemplateColumns={{ base: "1fr", sm: "repeat(3, 1fr)" }}
					gap="3"
				>
					{leagues.map((league) => (
						<LeagueRoomCard key={league.id} league={league} />
					))}
				</Grid>
			</VStack>

			<VStack gap="3" alignItems="stretch">
				<SectionLabel>Locking soon</SectionLabel>
				{lockingSoon.length > 0 ? (
					<VStack gap="3" alignItems="stretch">
						{lockingSoon.map((question) => (
							<QuestionCard key={question.id} question={question} />
						))}
					</VStack>
				) : (
					<EmptyState>
						Nothing locking soon. Open a league to find questions worth calling.
					</EmptyState>
				)}
			</VStack>

			<VStack gap="3" alignItems="stretch">
				<SectionLabel>Just resolved</SectionLabel>
				{justResolved.length > 0 ? (
					<VStack gap="3" alignItems="stretch">
						{justResolved.map(
							(call) =>
								call.question && (
									<QuestionCard key={call.id} question={call.question} />
								),
						)}
					</VStack>
				) : (
					<EmptyState>
						No results yet. Your calls will show up here as they resolve.
					</EmptyState>
				)}
			</VStack>
		</VStack>
	)
}
