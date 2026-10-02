import type { gameStarterRole } from "../schema"
import type {
	EspnDepthChart,
	EspnDepthChartPosition,
	EspnLineupEntry,
	EspnProbable,
	EspnProbablesEvent,
	EspnStatistic,
	EspnSummaryRoster,
} from "./espn-client"

export type StarterRole = (typeof gameStarterRole.enumValues)[number]

export type ParsedStarter = {
	espnAthleteId: string
	playerName: string
	position: string | null
	sortOrder: number
	statLine: string | null
	injuryStatus: string | null
}

// Everything ESPN currently lists for one team in one role - the unit
// sync-game-starters.ts replaces as a whole. An empty `starters` means ESPN
// affirmatively lists nobody (a probable pitcher back to TBD), so stored rows
// for it get cleared. When ESPN just hasn't published anything yet, no group
// is produced at all and stored rows stay put.
export type ParsedStarterGroup = {
	espnTeamId: string
	role: StarterRole
	starters: ParsedStarter[]
}

// The same W-L and ERA ESPN's scoreboard prints next to a probable. Null
// rather than a partial line when any of the three is missing.
function pitcherStatLine(
	statistics: EspnStatistic[] | undefined,
): string | null {
	const stat = (abbreviation: string) =>
		statistics?.find((s) => s.abbreviation === abbreviation)?.displayValue
	const wins = stat("W")
	const losses = stat("L")
	const era = stat("ERA")
	if (wins === undefined || losses === undefined || era === undefined) {
		return null
	}
	return `${wins}-${losses}, ${era} ERA`
}

// One group per competitor, including an empty one when ESPN lists no
// probable for that team.
function probableGroups(
	event: EspnProbablesEvent,
	probableName: string,
	role: StarterRole,
	position: (probable: EspnProbable) => string,
	statLine: (probable: EspnProbable) => string | null,
): ParsedStarterGroup[] {
	return event.competitions[0].competitors.map((competitor) => {
		const probable = competitor.probables?.find((p) => p.name === probableName)
		return {
			espnTeamId: competitor.team.id,
			role,
			starters: probable
				? [
						{
							espnAthleteId: probable.athlete.id,
							playerName: probable.athlete.displayName,
							position: position(probable),
							sortOrder: 1,
							statLine: statLine(probable),
							injuryStatus: null,
						},
					]
				: [],
		}
	})
}

export function parseProbables(
	event: EspnProbablesEvent,
): ParsedStarterGroup[] {
	return probableGroups(
		event,
		"probableStartingPitcher",
		"starting_pitcher",
		(probable) => probable.abbreviation,
		(probable) => pitcherStatLine(probable.statistics),
	)
}

// ESPN's NHL probables carry no season line (an empty statistics array,
// verified live), so a goalie's row has none. Filed as "G" rather than ESPN's
// "SG", which reads as a shooting guard everywhere else.
export function parseProbableGoalies(
	event: EspnProbablesEvent,
): ParsedStarterGroup[] {
	return probableGroups(
		event,
		"probableStartingGoalie",
		"starting_goalie",
		() => "G",
		() => null,
	)
}

// Only teams whose lineup is actually posted produce a group. An empty roster
// says nothing about who's starting, so it leaves any stored lineup alone.
export function parseBattingOrders(
	rosters: EspnSummaryRoster[],
): ParsedStarterGroup[] {
	return rosters.flatMap((team) => {
		const seenSpots = new Set<number>()
		const starters = (team.roster ?? [])
			.filter(
				(entry): entry is EspnLineupEntry & { batOrder: number } =>
					entry.starter === true && (entry.batOrder ?? 0) > 0,
			)
			.sort((a, b) => a.batOrder - b.batOrder)
			.filter((entry) => {
				if (seenSpots.has(entry.batOrder)) return false
				seenSpots.add(entry.batOrder)
				return true
			})
			.map((entry) => ({
				espnAthleteId: entry.athlete.id,
				playerName: entry.athlete.displayName,
				position: entry.position?.abbreviation ?? null,
				sortOrder: entry.batOrder,
				statLine: null,
				injuryStatus: null,
			}))
		if (starters.length === 0) return []
		return [{ espnTeamId: team.team.id, role: "batter" as const, starters }]
	})
}

// athletes[0] at every position in the order given. A chart with nobody listed
// anywhere produces no group, same as an unposted lineup.
function firstStringGroup(
	espnTeamId: string,
	role: StarterRole,
	positions: [string, EspnDepthChartPosition][],
): ParsedStarterGroup[] {
	const starters = positions.flatMap(([, slot], index) => {
		const athlete = slot.athletes[0]
		if (!athlete) return []
		return [
			{
				espnAthleteId: athlete.id,
				playerName: athlete.displayName,
				position: slot.position.abbreviation,
				sortOrder: index + 1,
				statLine: null,
				injuryStatus: athlete.injuries?.[0]?.status ?? null,
			},
		]
	})
	return starters.length > 0 ? [{ espnTeamId, role, starters }] : []
}

// ESPN lists offensive slots receivers first with the quarterback near the
// end, which reads backwards as a lineup. Backfield, then receivers, then the
// line. A slot not named here keeps ESPN's order after these.
const NFL_OFFENSE_ORDER = [
	"qb",
	"rb",
	"fb",
	"wr",
	"te",
	"lt",
	"lg",
	"c",
	"rg",
	"rt",
]

function offenseRank(slot: string): number {
	const index = NFL_OFFENSE_ORDER.indexOf(slot.replace(/\d+$/, ""))
	return index === -1 ? NFL_OFFENSE_ORDER.length : index
}

// NFL teams publish three charts named after their base formation ("3WR 1TE",
// "Base 4-3 D", "Special Teams"), so the names differ team to team. The
// offense is the chart with a quarterback, special teams the one with a
// kicker, and the remaining one the defense. Only the first chart per side
// counts, so a team publishing an extra package can't overwrite its base one.
export function parseNflDepthChart(
	espnTeamId: string,
	charts: EspnDepthChart[],
): ParsedStarterGroup[] {
	const groups: ParsedStarterGroup[] = []
	for (const chart of charts) {
		const entries = Object.entries(chart.positions)
		if ("pk" in chart.positions) continue
		const role: StarterRole = "qb" in chart.positions ? "offense" : "defense"
		if (groups.some((group) => group.role === role)) continue
		const ordered =
			role === "offense"
				? [...entries].sort(([a], [b]) => offenseRank(a) - offenseRank(b))
				: entries
		groups.push(...firstStringGroup(espnTeamId, role, ordered))
	}
	return groups
}

// A single chart with one slot per position, already in PG, SG, SF, PF, C
// order.
export function parseNbaDepthChart(
	espnTeamId: string,
	charts: EspnDepthChart[],
): ParsedStarterGroup[] {
	const chart = charts[0]
	if (!chart) return []
	return firstStringGroup(
		espnTeamId,
		"starter",
		Object.entries(chart.positions),
	)
}
