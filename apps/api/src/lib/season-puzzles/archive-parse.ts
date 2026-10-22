import type {
	EspnStandingsGroup,
	EspnTeamLeaders,
	EspnTeamPostseasonEvent,
} from "../../db/sync/espn-client"

// Reading ESPN's records of a finished season into team_seasons rows. Pure,
// so the archive's reads can be tested against recorded responses.

export type SeasonLeague = "nfl" | "nba" | "mlb" | "nhl"

export function isSeasonLeague(slug: string): slug is SeasonLeague {
	return slug === "nfl" || slug === "nba" || slug === "mlb" || slug === "nhl"
}

// The categories a season's clues read, per league. Only these are kept.
export const LEADER_CATEGORIES: Record<SeasonLeague, readonly string[]> = {
	nfl: ["passingLeader", "rushingLeader", "receivingLeader"],
	nba: ["pointsPerGame", "reboundsPerGame", "assistsPerGame"],
	mlb: ["homeRuns", "avg", "wins"],
	nhl: ["points", "goals", "assists", "wins"],
}

// "1995-96" for a league whose season crosses the new year, keyed by the
// year it ends in, as ESPN keys it.
export function seasonLabel(league: SeasonLeague, year: number): string {
	if (league === "nba" || league === "nhl") {
		return `${year - 1}-${String(year).slice(-2)}`
	}
	return String(year)
}

export type ArchiveStandingsRow = {
	espnTeamId: string
	name: string
	wins: number
	losses: number
	ties: number
	otLosses: number
	pointsFor: number
	pointsAgainst: number
	conference: string | null
	division: string | null
	divisionRank: number
}

function stat(
	entry: { stats: { name: string; value?: number; displayValue?: string }[] },
	name: string,
): number {
	const found = entry.stats.find((s) => s.name === name)
	const value = found?.value ?? Number(found?.displayValue)
	return Number.isFinite(value) ? Number(value) : 0
}

export const NHL_FIRST_OT_LOSS_YEAR = 2000

// Every team in a season's standings, read at the division level: the
// league at the root, then conferences, then divisions. A league ESPN only
// splits into conferences (the NHL) has no division. Place is worked out
// within each leaf group, by points in the NHL and win percentage elsewhere.
// Before 1999-2000 an NHL overtime loss was just a loss, worth no point, but
// ESPN still counts those apart; they're folded back into losses. A table
// for another season (ESPN's answer for a year it has no standings for) is
// left out.
export function parseArchiveStandings(
	root: EspnStandingsGroup,
	league: SeasonLeague,
	year: number,
): ArchiveStandingsRow[] {
	const separateOtLosses = league === "nhl" && year >= NHL_FIRST_OT_LOSS_YEAR
	const rows: ArchiveStandingsRow[] = []
	const walk = (group: EspnStandingsGroup, path: string[]) => {
		const entries = group.standings?.entries ?? []
		const season = group.standings?.season
		if (entries.length > 0 && (season === undefined || season === year)) {
			const ranked = entries
				.map((entry, order) => {
					const wins = stat(entry, "wins")
					const ties = stat(entry, "ties")
					const espnOtLosses = league === "nhl" ? stat(entry, "otLosses") : 0
					const otLosses = separateOtLosses ? espnOtLosses : 0
					const losses =
						stat(entry, "losses") + (separateOtLosses ? 0 : espnOtLosses)
					const games = wins + losses + ties + otLosses
					const standing =
						league === "nhl"
							? 2 * wins + ties + otLosses
							: games > 0
								? (wins + ties / 2) / games
								: 0
					return { entry, order, wins, losses, ties, otLosses, standing }
				})
				.sort((a, b) => b.standing - a.standing || a.order - b.order)
			ranked.forEach((r, index) => {
				rows.push({
					espnTeamId: r.entry.team.id,
					name: (r.entry.team.displayName ?? "").replace(/\s+/g, " ").trim(),
					wins: r.wins,
					losses: r.losses,
					ties: r.ties,
					otLosses: r.otLosses,
					pointsFor: stat(r.entry, "pointsFor"),
					pointsAgainst: stat(r.entry, "pointsAgainst"),
					conference: path[1] ?? null,
					division: path[2] ?? null,
					divisionRank: index + 1,
				})
			})
		}
		for (const child of group.children ?? []) {
			walk(child, [...path, child.name ?? ""])
		}
	}
	walk(root, [root.name ?? ""])
	return rows
}

export type PostseasonOutcome =
	| { outcome: "champion" | "finalist"; roundsFromFinal: 0 }
	| { outcome: "lost_semifinal"; roundsFromFinal: 1 }
	| { outcome: "lost_round"; roundsFromFinal: number }

type Series = {
	teams: [string, string]
	winner: string | null
	lastDate: string
}

// A postseason's series, from every game any team in it played. A series is
// a run of games between the same two teams with neither playing anyone
// else in between, so a single-game round (the NFL's) is a series of one.
function seriesOf(events: EspnTeamPostseasonEvent[]): Series[] {
	const games = [...new Map(events.map((e) => [e.id, e])).values()]
		.map((e) => {
			const competitors = e.competitions[0]?.competitors ?? []
			const [a, b] = competitors.map((c) => c.team.id)
			const winner = competitors.find((c) => c.winner)?.team.id ?? null
			return a && b ? { date: e.date, a, b, winner } : null
		})
		.filter((g) => g !== null)
		.sort((x, y) => x.date.localeCompare(y.date))

	const open = new Map<string, Series & { wins: Map<string, number> }>()
	const closed: (Series & { wins: Map<string, number> })[] = []
	const keyOf = (a: string, b: string) => [a, b].sort().join("|")
	for (const game of games) {
		const key = keyOf(game.a, game.b)
		for (const [otherKey, series] of open) {
			if (otherKey === key) continue
			if (series.teams.includes(game.a) || series.teams.includes(game.b)) {
				closed.push(series)
				open.delete(otherKey)
			}
		}
		const series = open.get(key) ?? {
			teams: [game.a, game.b] as [string, string],
			winner: null,
			lastDate: game.date,
			wins: new Map<string, number>(),
		}
		if (game.winner) {
			series.wins.set(game.winner, (series.wins.get(game.winner) ?? 0) + 1)
		}
		series.lastDate = game.date
		open.set(key, series)
	}
	closed.push(...open.values())
	return closed.map((s) => {
		const [a, b] = s.teams
		const aWins = s.wins.get(a) ?? 0
		const bWins = s.wins.get(b) ?? 0
		return {
			teams: s.teams,
			winner: aWins === bWins ? null : aWins > bWins ? a : b,
			lastDate: s.lastDate,
		}
	})
}

// How each playoff team's postseason ended, by ESPN team id. The final is the
// series holding the postseason's last game. Any other series is as many
// rounds from the final as its winner still had to win to get there, plus
// one, so byes and uneven brackets count right. A team missing from the map
// didn't make the playoffs.
export function postseasonOutcomes(
	events: EspnTeamPostseasonEvent[],
): Map<string, PostseasonOutcome> {
	const all = seriesOf(events).sort((a, b) =>
		a.lastDate.localeCompare(b.lastDate),
	)
	const outcomes = new Map<string, PostseasonOutcome>()
	const final = all.at(-1)
	if (!final) return outcomes

	const roundsFromFinal = (series: Series, depth = 0): number | null => {
		if (series === final) return 0
		if (!series.winner || depth > all.length) return null
		const next = all.find(
			(s) =>
				s.lastDate > series.lastDate &&
				series.winner !== null &&
				s.teams.includes(series.winner),
		)
		if (!next) return null
		const rest = roundsFromFinal(next, depth + 1)
		return rest === null ? null : rest + 1
	}

	for (const series of all) {
		for (const team of series.teams) {
			const later = all.some(
				(s) =>
					s !== series &&
					s.lastDate > series.lastDate &&
					s.teams.includes(team),
			)
			if (later) continue
			if (series === final) {
				outcomes.set(team, {
					outcome: team === final.winner ? "champion" : "finalist",
					roundsFromFinal: 0,
				})
				continue
			}
			const rounds = roundsFromFinal(series)
			if (rounds === null) continue
			outcomes.set(
				team,
				rounds === 1
					? { outcome: "lost_semifinal", roundsFromFinal: 1 }
					: { outcome: "lost_round", roundsFromFinal: rounds },
			)
		}
	}
	return outcomes
}

// A category's leader as the archive keeps it, before the athlete's name is
// looked up.
export type LeaderRef = { category: string; athleteRef: string; line: string }

export function leaderRefs(
	leaders: EspnTeamLeaders | null,
	league: SeasonLeague,
): LeaderRef[] {
	const wanted = LEADER_CATEGORIES[league]
	return (leaders?.categories ?? []).flatMap((category) => {
		if (!wanted.includes(category.name)) return []
		const top = category.leaders[0]
		if (!top?.athlete?.$ref) return []
		return [
			{
				category: category.name,
				athleteRef: top.athlete.$ref,
				line: top.displayValue,
			},
		]
	})
}

type Leader = { category: string; athlete: string; line: string }

function leaderNumber(line: string, unit: string): number | null {
	const match = line.match(new RegExp(`([\\d,.]+)\\s*${unit}`))
	return match?.[1] ? Number(match[1].replace(/,/g, "")) : null
}

// Whether a season's leaders can be trusted to make true clues. ESPN's
// records of the 1980s and early 1990s are missing some players outright
// (Walter Payton's 1985, Larry Bird's whole career), and the leader it
// names instead is a backup or the wrong position. Those seasons stay in
// the archive but never run, so no clue names the wrong player.
export function leadersLookComplete(
	league: SeasonLeague,
	leaders: Leader[],
): boolean {
	const by = new Map(leaders.map((l) => [l.category, l]))
	const required =
		league === "nhl"
			? ["points", "goals", "assists"]
			: LEADER_CATEGORIES[league]
	if (!required.every((c) => by.has(c))) return false

	if (league === "nfl") {
		const passing = by.get("passingLeader")?.line ?? ""
		const attempts = Number(passing.match(/\d+\/(\d+)/)?.[1] ?? 0)
		const carries = leaderNumber(by.get("rushingLeader")?.line ?? "", "CAR")
		const catches = leaderNumber(by.get("receivingLeader")?.line ?? "", "REC")
		return attempts >= 200 && (carries ?? 0) >= 100 && (catches ?? 0) >= 25
	}
	if (league === "nba") {
		const points = Number(by.get("pointsPerGame")?.line)
		const assists = Number(by.get("assistsPerGame")?.line)
		return points >= 12 && assists >= 4
	}
	if (league === "nhl") {
		return Number(by.get("points")?.line) >= 30
	}
	return true
}
