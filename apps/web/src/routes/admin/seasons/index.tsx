import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AdminSeasonDay } from "#/components/admin/seasons/admin-season-day"
import { seasonDateLabel } from "#/components/play/name-that-season/season-result"
import { Card } from "#/components/ui/card"
import { InfoCard } from "#/components/ui/info-card"
import { PageHeader } from "#/components/ui/page-header"
import { SectionLabel } from "#/components/ui/section-label"
import { Tag } from "#/components/ui/tag"
import { adminSeasonScheduleQuery } from "#/graphql/season-puzzles/queries"

// How many days ahead the daily fill keeps covered
// (SEASON_SCHEDULE_AHEAD_DAYS on the API). A gap inside it means a league ran
// out of seasons.
const FILL_AHEAD_DAYS = 14

// The next 30 days of Name That Season. The daily job fills the next two
// weeks from the archive on its own; this page is only for overriding a day.
export const Route = createFileRoute("/admin/seasons/")({
	component: RouteComponent,
	loader: ({ context }) => context.queryClient.query(adminSeasonScheduleQuery),
})

function RouteComponent() {
	const { data } = useSuspenseQuery(adminSeasonScheduleQuery)
	const schedule =
		data.adminSeasonSchedule.__typename === "QueryAdminSeasonScheduleSuccess"
			? data.adminSeasonSchedule.data
			: null
	if (!schedule) return null

	const gaps = schedule.days.slice(0, FILL_AHEAD_DAYS).filter((d) => !d.puzzle)
	const leagues = schedule.pool.map((p) => p.league)
	const future = schedule.days
		.slice(1)
		.filter((d) => d.puzzle)
		.map((d) => ({ date: d.date, label: seasonDateLabel(d.date) }))

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Name That Season schedule"
				subtitle="Filled from the archive each morning. Change a day only to override it."
			/>
			{gaps.length > 0 && (
				<InfoCard
					heading="Gaps coming up"
					body={`${gaps.length} of the next ${FILL_AHEAD_DAYS} days have no season. The archive may be missing a league's seasons.`}
				/>
			)}
			<VStack gap="3" alignItems="stretch">
				<SectionLabel>Seasons left to run</SectionLabel>
				<HStack gap="2" flexWrap="wrap">
					{schedule.pool.map((p) => (
						<Tag
							key={p.league.id}
							variant={p.ready < 30 ? "danger" : "neutral"}
						>
							{`${p.league.abbreviation} · ${p.ready}`}
						</Tag>
					))}
				</HStack>
			</VStack>
			<Card>
				<div className={css({ display: "flex", flexDirection: "column" })}>
					{schedule.days.map((day, i) => (
						<AdminSeasonDay
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
