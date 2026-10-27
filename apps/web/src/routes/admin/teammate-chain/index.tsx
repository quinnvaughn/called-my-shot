import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { AdminChainDay } from "#/components/admin/teammate-chain/admin-chain-day"
import { seasonDateLabel } from "#/components/arcade/name-that-season/season-result"
import { Card } from "#/components/ui/card"
import { InfoCard } from "#/components/ui/info-card"
import { PageHeader } from "#/components/ui/page-header"
import { gqlQueryOptions } from "#/graphql/query-options"
import { LeaguesDocument } from "#/graphql/sports/catalog/queries"
import { adminTeammateChainScheduleQuery } from "#/graphql/teammate-chain/queries"

// How many days ahead the daily fill keeps covered
// (CHAIN_SCHEDULE_AHEAD_DAYS on the API).
const FILL_AHEAD_DAYS = 14

const leaguesQuery = gqlQueryOptions(LeaguesDocument, {})

// The next 30 days of Teammate Chain. The daily job picks the next two weeks
// from the rosters on its own; this page is only for overriding a day.
export const Route = createFileRoute("/admin/teammate-chain/")({
	component: RouteComponent,
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.query(adminTeammateChainScheduleQuery),
			context.queryClient.query(leaguesQuery),
		]),
})

function RouteComponent() {
	const { data } = useSuspenseQuery(adminTeammateChainScheduleQuery)
	const { data: leagueData } = useSuspenseQuery(leaguesQuery)
	const days =
		data.adminTeammateChainSchedule.__typename ===
		"QueryAdminTeammateChainScheduleSuccess"
			? data.adminTeammateChainSchedule.data
			: null
	if (!days) return null

	const leagues = leagueData.leagues.filter((l) =>
		["nfl", "nba", "mlb", "nhl"].includes(l.slug),
	)
	const gaps = days.slice(0, FILL_AHEAD_DAYS).filter((d) => !d.puzzle)
	const future = days
		.slice(1)
		.filter((d) => d.puzzle)
		.map((d) => ({ date: d.date, label: seasonDateLabel(d.date) }))

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Teammate Chain schedule"
				subtitle="Picked from the rosters each morning. Change a day only to override it."
			/>
			{gaps.length > 0 && (
				<InfoCard
					heading="Gaps coming up"
					body={`${gaps.length} of the next ${FILL_AHEAD_DAYS} days have no chain. The roster history may not be loaded yet (history:ingest).`}
				/>
			)}
			<Card>
				<div className={css({ display: "flex", flexDirection: "column" })}>
					{days.map((day, i) => (
						<AdminChainDay
							key={day.date}
							date={day.date}
							isToday={i === 0}
							day={day.puzzle ?? null}
							leagues={leagues}
							otherDates={future.filter((d) => d.date !== day.date)}
						/>
					))}
				</div>
			</Card>
		</VStack>
	)
}
