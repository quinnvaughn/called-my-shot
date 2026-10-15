import { useMemo } from "react"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { AdminFilterPill } from "#/components/admin/admin-filter-pill"
import { Select } from "#/components/ui/select"
import { TextInput } from "#/components/ui/text-input"
import type {
	AdminBallotScopeQuery,
	BallotStatus,
	SportsQuery,
} from "#/graphql/generated/graphql"

const STATUS_FILTERS: { value: BallotStatus | null; label: string }[] = [
	{ value: null, label: "All" },
	{ value: "DRAFT", label: "Draft" },
	{ value: "PUBLISHED", label: "Published" },
]

// Empty string is the Select's "no filter" value - Select's value is a plain
// string, so the sentinel lives here rather than as a nullable value type.
export const ALL_LEAGUES = ""

export function AdminBallotsFilters({
	search,
	onSearchChange,
	sports,
	leagueId,
	onLeagueChange,
	seasons,
	seasonId,
	onSeasonChange,
	status,
	onStatusChange,
}: {
	search: string
	onSearchChange: (search: string) => void
	sports: SportsQuery["sports"] | undefined
	leagueId: string
	onLeagueChange: (leagueId: string) => void
	seasons: AdminBallotScopeQuery["leagueSeasons"]
	seasonId: string | null
	onSeasonChange: (seasonId: string) => void
	status: BallotStatus | null
	onStatusChange: (status: BallotStatus | null) => void
}) {
	const leagues = useMemo(
		() => sports?.flatMap((sport) => sport.leagues) ?? [],
		[sports],
	)
	const selectedLeague = leagues.find((league) => league.id === leagueId)
	const selectedSeason = seasons.find((season) => season.id === seasonId)

	return (
		<>
			<TextInput>
				<TextInput.Group>
					<TextInput.Field
						placeholder="Search ballots…"
						value={search}
						onChange={(e) => onSearchChange(e.target.value)}
					/>
				</TextInput.Group>
			</TextInput>
			<HStack gap="3" flexWrap="wrap" alignItems="flex-start">
				<Select
					value={leagueId}
					onValueChange={onLeagueChange}
					className={css({ width: "44" })}
				>
					<Select.Trigger>
						{selectedLeague?.name ?? "All leagues"}
					</Select.Trigger>
					<Select.Content>
						<Select.Option value={ALL_LEAGUES}>All leagues</Select.Option>
						{sports?.map((sport) => (
							<div key={sport.id}>
								<Select.GroupLabel>{sport.name}</Select.GroupLabel>
								{sport.leagues.map((league) => (
									<Select.Option key={league.id} value={league.id}>
										{league.name}
									</Select.Option>
								))}
							</div>
						))}
					</Select.Content>
				</Select>
				<Select
					value={seasonId ?? ""}
					onValueChange={onSeasonChange}
					className={css({ width: "36" })}
				>
					<Select.Trigger disabled={!leagueId}>
						{selectedSeason?.displayName ?? "Season"}
					</Select.Trigger>
					<Select.Content>
						{seasons.map((season) => (
							<Select.Option key={season.id} value={season.id}>
								{season.displayName}
							</Select.Option>
						))}
					</Select.Content>
				</Select>
				<HStack gap="1.5" flexWrap="wrap">
					{STATUS_FILTERS.map((filter) => (
						<AdminFilterPill
							key={filter.label}
							active={status === filter.value}
							onClick={() => onStatusChange(filter.value)}
						>
							{filter.label}
						</AdminFilterPill>
					))}
				</HStack>
			</HStack>
		</>
	)
}
