import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { AdminRankDay } from "#/components/admin/blind-rank/admin-rank-day"
import { seasonDateLabel } from "#/components/arcade/name-that-season/season-result"
import { Card } from "#/components/ui/card"
import { InfoCard } from "#/components/ui/info-card"
import { PageHeader } from "#/components/ui/page-header"
import { adminRankScheduleQuery } from "#/graphql/blind-rank/queries"
import { gqlQueryOptions } from "#/graphql/query-options"
import { LeaguesDocument } from "#/graphql/sports/catalog/queries"

// How many days ahead the daily fill keeps covered
// (RANK_SCHEDULE_AHEAD_DAYS on the API).
const FILL_AHEAD_DAYS = 14

const leaguesQuery = gqlQueryOptions(LeaguesDocument, {})

// The next 30 days of Blind Rank. The daily job builds the next two weeks
// from the pools on its own; this page is only for overriding a day.
export const Route = createFileRoute("/admin/blind-rank/")({
	component: RouteComponent,
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.query(adminRankScheduleQuery),
			context.queryClient.query(leaguesQuery),
		]),
})

function RouteComponent() {
	const { data } = useSuspenseQuery(adminRankScheduleQuery)
	const { data: leagueData } = useSuspenseQuery(leaguesQuery)
	const days =
		data.adminRankSchedule.__typename === "QueryAdminRankScheduleSuccess"
			? data.adminRankSchedule.data
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
				title="Blind Rank schedule"
				subtitle="Built from the pools each morning. Change a day only to override it."
			/>
			{gaps.length > 0 && (
				<InfoCard
					heading="Gaps coming up"
					body={`${gaps.length} of the next ${FILL_AHEAD_DAYS} days have no puzzle. The player pools may not be loaded yet.`}
				/>
			)}
			<Card>
				<div className={css({ display: "flex", flexDirection: "column" })}>
					{days.map((day, i) => (
						<AdminRankDay
							key={day.date}
							date={day.date}
							isToday={i === 0}
							puzzle={day.puzzle ?? null}
							leagues={leagues}
							otherDates={future.filter((d) => d.date !== day.date)}
						/>
					))}
				</div>
			</Card>
		</VStack>
	)
}
