import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Select } from "#/components/ui/select"
import { Tabs } from "#/components/ui/tabs"
import {
	ALL_SEASONS,
	type FilterLeague,
	type LeaderboardFilter,
	type LeaderboardSearch,
	pickerSeasons,
	THIS_WEEK,
	toSearch,
} from "#/lib/leaderboard-filter"

type LeaderboardFiltersProps = {
	leagues: FilterLeague[]
	filter: LeaderboardFilter
	onChange: (search: LeaderboardSearch) => void
	// Offers This week above the seasons. Group boards only.
	weekly?: boolean
}

// Shared by the site leaderboard and the group one - both rank the same way
// over the same two axes, so they pick a scope the same way too.
//
// Tabs for league (a small, fixed, admin-curated set) and a Select for season
// (one more option every year). The Select always renders, even on the All
// tab where its only choices are Current and All time: a board whose header
// doesn't say which season it covers is ambiguous the moment a second season
// exists. A single league drops the All tab, since it would rank exactly what
// that league's own tab does, but keeps its own tab so the board still says
// which league it is.
export function LeaderboardFilters({
	leagues,
	filter,
	onChange,
	weekly = false,
}: LeaderboardFiltersProps) {
	if (leagues.length === 0) return null

	const league = filter.league
	// A year only names a season alongside a league (seasons.year is ESPN's
	// own label, meaning different things per league), so the All tab offers
	// the two league-independent scopes instead of a list of years.
	const seasons = league ? pickerSeasons(league) : []

	function selectLeague(slug: string) {
		const next = slug === "all" ? null : (leagues.find((l) => l.slug === slug) ?? null)
		// Season resets to the new league's current season rather than carrying
		// the old one over - a season id from one league is meaningless in
		// another, and "the season I was just looking at" isn't a thing that
		// survives a league switch. The week does: it's the same week in every
		// league.
		onChange(toSearch(next, filter.thisWeek ? THIS_WEEK : "current"))
	}

	return (
		<HStack justify="space-between" alignItems="center" gap="3" flexWrap="wrap">
			<Tabs
				value={league?.slug ?? "all"}
				onValueChange={selectLeague}
			>
				<Tabs.List>
					{leagues.length > 1 && <Tabs.Trigger value="all">All</Tabs.Trigger>}
					{leagues.map((l) => (
						<Tabs.Trigger key={l.id} value={l.slug}>
							{l.abbreviation}
						</Tabs.Trigger>
					))}
				</Tabs.List>
			</Tabs>
			{/* Fixed width, like the admin ballot list's own league/season
			    pickers: the trigger is content-width by default, so "Current
			    season" / "All time" / "2025-26" would each resize it and shove
			    the tabs around on every change. */}
			<Select
				value={filter.seasonValue}
				onValueChange={(value) => onChange(toSearch(league, value))}
				className={css({ width: "40", flexShrink: "0" })}
			>
				<Select.Trigger>{seasonLabel(filter, league)}</Select.Trigger>
				<Select.Content>
					{weekly && <Select.Option value={THIS_WEEK}>This week</Select.Option>}
					{league ? (
						seasons.map((season) => (
							<Select.Option key={season.id} value={season.year.toString()}>
								{season.displayName}
							</Select.Option>
						))
					) : (
						<Select.Option value="current">Current season</Select.Option>
					)}
					<Select.Option value={ALL_SEASONS}>All time</Select.Option>
				</Select.Content>
			</Select>
		</HStack>
	)
}

function seasonLabel(
	filter: LeaderboardFilter,
	league: FilterLeague | null,
): string {
	if (filter.thisWeek) return "This week"
	if (filter.seasonValue === ALL_SEASONS) return "All time"
	if (!league) return "Current season"
	const season = pickerSeasons(league).find(
		(s) => s.year.toString() === filter.seasonValue,
	)
	return season?.displayName ?? "Current season"
}
