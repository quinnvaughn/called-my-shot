import { useSuspenseQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { ResultsCalendar } from "#/components/profile/results-calendar/results-calendar"
import { homeDashboardQuery } from "#/graphql/home/queries"
import { HomeSectionLabel } from "./home-section-label"

export function HomeResultsSection({
	placement,
}: {
	placement: "main" | "rail"
}) {
	const { data } = useSuspenseQuery(homeDashboardQuery)
	const me = data.me
	const record = me?.record
	if (!me || !record) {
		return null
	}
	return (
		<VStack gap="3" alignItems="stretch">
			<HStack justify="space-between" alignItems="baseline" gap="3">
				<HomeSectionLabel>Your results</HomeSectionLabel>
				<Link
					to="/user/$username"
					params={{ username: me.username }}
					search={{ tab: "calls" }}
					className={css({
						fontSize: "xs",
						color: "primary.default",
						whiteSpace: "nowrap",
						_hover: { textDecoration: "underline" },
					})}
				>
					Full record →
				</Link>
			</HStack>
			<ResultsCalendar
				calendar={record.calendar}
				username={me.username}
				compact={placement === "rail"}
			/>
		</VStack>
	)
}
