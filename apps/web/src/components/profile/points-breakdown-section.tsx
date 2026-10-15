import { VStack } from "styled-system/jsx"
import { SectionLabel } from "#/components/ui/section-label"
import { TeamBadge } from "#/components/ui/team-badge"
import type { UserRecordQuery } from "#/graphql/generated/graphql"
import type { PointsGroup, PointsRow, PointsView } from "#/lib/points-breakdown"
import { PointsBreakdown } from "./points-breakdown/points-breakdown"

// The best and worst teams the team view keeps on screen before the rest fold.
const TEAM_ROWS_AT_EACH_END = 3

type ProfileRecord = NonNullable<
	NonNullable<UserRecordQuery["userByUsername"]>["record"]
>

// Leagues (career view only), then play-type families with their shapes
// nested or teams, one at a time, then the bonuses no call earned. The league
// rows, the family rows and the team rows each add up to the calls' net, and
// any of them plus the bonuses is the points tile above them.
function breakdownGroups(record: ProfileRecord): PointsGroup[] {
	const groups: PointsGroup[] = []
	if (record.byLeague.length > 0) {
		groups.push({
			views: [
				{
					label: "By league",
					rows: record.byLeague.map((row) => ({
						key: row.league.id,
						label: row.league.name,
						netPoints: row.netPoints,
						wins: row.wins,
						losses: row.losses,
						returnPct: row.returnPct ?? null,
						leagueSlug: row.league.slug,
					})),
				},
			],
		})
	}
	const families: PointsRow[] = record.byFamily.map((family) => ({
		key: family.family,
		label: family.label,
		netPoints: family.netPoints,
		wins: family.wins,
		losses: family.losses,
		returnPct: family.returnPct ?? null,
		children: record.byShape
			.filter((shape) => shape.family === family.family)
			.map((shape) => ({
				key: shape.shape,
				label: shape.label,
				netPoints: shape.netPoints,
				wins: shape.wins,
				losses: shape.losses,
				returnPct: shape.returnPct ?? null,
			})),
	}))
	const teamRows: PointsRow[] = record.byTeam.map((row) => ({
		key: row.team?.id ?? "no-team",
		label: row.team?.name ?? "No specific team",
		icon: row.team && (
			<TeamBadge
				abbreviation={row.team.abbreviation}
				color={row.team.color}
				logoUrl={row.team.logoUrl}
			/>
		),
		netPoints: row.netPoints,
		wins: row.wins,
		losses: row.losses,
		returnPct: row.returnPct ?? null,
	}))
	// The API sorts the no-team row last, outside the best-to-worst order.
	const teams = teamRows.filter((row) => row.key !== "no-team")
	const noTeam = teamRows.filter((row) => row.key === "no-team")
	const splits: PointsView[] = [
		...(families.length > 0 ? [{ label: "By play type", rows: families }] : []),
		...(teamRows.length > 0
			? [
					{
						label: "By team",
						rows: teams,
						fold: { ends: TEAM_ROWS_AT_EACH_END, label: "Show all teams" },
						pinned: noTeam,
					},
				]
			: []),
	]
	if (splits.length > 0) groups.push({ views: splits })
	if (record.bonusPoints !== 0) {
		groups.push({
			views: [
				{
					label: "Bonuses",
					cardScale: true,
					rows: [
						{
							key: "bonuses",
							label: "Streaks & sweeps",
							netPoints: record.bonusPoints,
							wins: null,
							losses: null,
							returnPct: null,
						},
					],
				},
			],
		})
	}
	return groups
}

export function PointsBreakdownSection({
	record,
	username,
}: {
	record: ProfileRecord
	username: string
}) {
	const breakdown = breakdownGroups(record)
	if (breakdown.length === 0) return null
	return (
		<VStack alignItems="stretch" gap="3">
			<SectionLabel>Where the points come from</SectionLabel>
			<PointsBreakdown groups={breakdown} username={username} />
		</VStack>
	)
}
