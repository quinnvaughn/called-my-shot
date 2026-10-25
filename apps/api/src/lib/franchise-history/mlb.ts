import { MLB_FRANCHISES } from "./franchise-map"
import { fetchJson, fetchText, mapPool } from "./http"
import type { HistoryPlayer, HistoryStint, Log } from "./types"
import { sparql } from "./wikidata"

// MLB's all-time pools. Membership comes from statsapi.mlb.com's full-season
// rosters, read per franchise per season back to the franchise's first year;
// MLB keys them by MLBAM person id and keeps one team id per franchise
// through every move. Value comes from Baseball-Reference's WAR tables
// (war_daily_bat / war_daily_pitch), which carry the MLBAM id on every
// player-season-team row.

const STATSAPI = "https://statsapi.mlb.com/api/v1"
const WAR_BAT = "https://www.baseball-reference.com/data/war_daily_bat.txt"
const WAR_PITCH = "https://www.baseball-reference.com/data/war_daily_pitch.txt"

type RosterEntry = {
	person: { id: number; fullName?: string }
	position?: { abbreviation?: string }
}

// One franchise season's roster: everyone who appeared for the team that
// year, as statsapi's fullSeason roster lists them.
export function parseMlbRoster(json: { roster?: RosterEntry[] }) {
	return (json.roster ?? []).map((entry) => ({
		id: String(entry.person.id),
		name: entry.person.fullName ?? "",
		position: entry.position?.abbreviation ?? null,
	}))
}

export type WarRow = {
	mlbamId: string
	name: string
	year: number
	// Baseball-Reference's code for that season's team ("NYY", "NYH" for the
	// 1903 Highlanders), resolved to a franchise by warTeamFranchises.
	teamCode: string
	games: number
	war: number
}

// A war_daily file: comma-separated with a header row, NULL for missing
// values. Rows without an MLBAM id (a few 19th-century players) can't be
// joined to statsapi and are skipped.
export function parseWarFile(text: string): WarRow[] {
	const lines = text.split("\n")
	const header = (lines[0] ?? "").split(",")
	const col = (name: string) => header.indexOf(name)
	const [name, mlbam, year, team, games, war] = [
		col("name_common"),
		col("mlb_ID"),
		col("year_ID"),
		col("team_ID"),
		col("G"),
		col("WAR"),
	]
	const rows: WarRow[] = []
	for (const line of lines.slice(1)) {
		const fields = line.split(",")
		const mlbamId = fields[mlbam]
		if (!mlbamId || mlbamId === "NULL") continue
		rows.push({
			mlbamId,
			name: fields[name] ?? "",
			year: Number(fields[year]),
			teamCode: fields[team] ?? "",
			games: Number(fields[games]) || 0,
			war: Number(fields[war]) || 0,
		})
	}
	return rows
}

// Which statsapi franchise each Baseball-Reference team-season is, decided
// by its players: whichever franchise's roster that year holds most of them.
// Saves keeping a hand map of bref's ~150 historical team codes.
export function warTeamFranchises(
	rows: WarRow[],
	memberships: Map<string, Set<string>>,
): Map<string, string> {
	const votes = new Map<string, Map<string, number>>()
	for (const row of rows) {
		const key = `${row.teamCode}:${row.year}`
		const tally = votes.get(key) ?? new Map<string, number>()
		for (const teamId of memberships.get(`${row.mlbamId}:${row.year}`) ?? []) {
			tally.set(teamId, (tally.get(teamId) ?? 0) + 1)
		}
		votes.set(key, tally)
	}
	const out = new Map<string, string>()
	for (const [key, tally] of votes) {
		const best = [...tally].sort((a, b) => b[1] - a[1])[0]
		if (best) out.set(key, best[0])
	}
	return out
}

// WAR with the franchise is the ordering, with a thousandth of a point per
// game so players without WAR still sort by how long they stayed, and a Hall
// of Fame bonus worth a strong decade.
export function mlbScore(war: number, games: number, hallOfFame: boolean) {
	return war + games / 1_000 + (hallOfFame ? 20 : 0)
}

async function loadHallOfFame(): Promise<Set<string>> {
	const json = await fetchJson<{ awards: { player?: { id: number } }[] }>(
		`${STATSAPI}/awards/MLBHOF/recipients`,
	)
	return new Set(
		json.awards.flatMap((award) =>
			award.player ? [String(award.player.id)] : [],
		),
	)
}

// MLBAM id (P3541) to ESPN's MLB id (P3571).
async function loadEspnCrosswalk(): Promise<Map<string, string>> {
	const rows = await sparql(`SELECT ?mlbam ?espn WHERE {
		?p wdt:P3541 ?mlbam ; wdt:P3571 ?espn .
	}`)
	return new Map(
		rows.flatMap((row) =>
			row.mlbam && row.espn ? [[row.mlbam, row.espn]] : [],
		),
	)
}

export const mlbHeadshotUrl = (mlbamId: string) =>
	`https://img.mlbstatic.com/mlb-photos/image/upload/w_213,q_auto:best/v1/people/${mlbamId}/headshot/67/current`

export async function loadMlbHistory(log: Log): Promise<HistoryPlayer[]> {
	const currentYear = new Date().getUTCFullYear()
	const { teams } = await fetchJson<{
		teams: { id: number; firstYearOfPlay?: string }[]
	}>(`${STATSAPI}/teams?sportId=1`)
	const firstYear = new Map(
		teams.map((team) => [team.id, Number(team.firstYearOfPlay) || 1876]),
	)

	const requests = Object.keys(MLB_FRANCHISES).flatMap((teamId) => {
		const from = firstYear.get(Number(teamId)) ?? 1876
		return Array.from({ length: currentYear - from + 1 }, (_, i) => ({
			teamId,
			season: from + i,
		}))
	})
	log(`mlb: reading ${requests.length} franchise-season rosters`)
	const rosters = await mapPool(requests, 8, async ({ teamId, season }) => ({
		teamId,
		season,
		players: parseMlbRoster(
			await fetchJson(
				`${STATSAPI}/teams/${teamId}/roster?rosterType=fullSeason&season=${season}`,
			),
		),
	}))

	// person -> franchise -> seasons, and person:year -> franchises.
	const seasonsByStint = new Map<string, Map<string, Set<number>>>()
	const memberships = new Map<string, Set<string>>()
	const people = new Map<string, { name: string; position: string | null }>()
	let latestSeason = 0
	for (const { teamId, season, players } of rosters) {
		for (const player of players) {
			latestSeason = Math.max(latestSeason, season)
			const known = people.get(player.id)
			people.set(player.id, {
				name: player.name || known?.name || "",
				position: player.position ?? known?.position ?? null,
			})
			const byTeam = seasonsByStint.get(player.id) ?? new Map()
			const seasons = byTeam.get(teamId) ?? new Set<number>()
			seasons.add(season)
			byTeam.set(teamId, seasons)
			seasonsByStint.set(player.id, byTeam)
			const key = `${player.id}:${season}`
			const teamsThatYear = memberships.get(key) ?? new Set<string>()
			teamsThatYear.add(teamId)
			memberships.set(key, teamsThatYear)
		}
	}
	log(`mlb: ${people.size} players`)

	const warRows = [
		...parseWarFile(await fetchText(WAR_BAT)),
		...parseWarFile(await fetchText(WAR_PITCH)),
	]
	const franchiseOf = warTeamFranchises(warRows, memberships)
	// A pitcher has a row in both files for the same team-season: his batting
	// WAR in one, pitching in the other. WAR adds up; games are the larger of
	// the two counts, since both count the same appearances.
	const value = new Map<string, { war: number; games: Map<string, number> }>()
	for (const row of warRows) {
		const teamId = franchiseOf.get(`${row.teamCode}:${row.year}`)
		if (!teamId) continue
		const key = `${row.mlbamId}:${teamId}`
		const entry = value.get(key) ?? { war: 0, games: new Map() }
		entry.war += row.war
		const seasonKey = `${row.year}:${row.teamCode}`
		entry.games.set(
			seasonKey,
			Math.max(entry.games.get(seasonKey) ?? 0, row.games),
		)
		value.set(key, entry)
	}

	const hallOfFame = await loadHallOfFame()
	const espn = await loadEspnCrosswalk()
	log(`mlb: ${hallOfFame.size} Hall of Famers, ${espn.size} ESPN ids`)

	// A handful of roster entries come without a name, which the WAR tables
	// fill in. Anyone still nameless is left out.
	for (const row of warRows) {
		const person = people.get(row.mlbamId)
		if (person && !person.name) person.name = row.name
	}
	const named = [...seasonsByStint].filter(
		([mlbamId]) => people.get(mlbamId)?.name,
	)
	return named.map(([mlbamId, byTeam]) => {
		const person = people.get(mlbamId) as {
			name: string
			position: string | null
		}
		const hof = hallOfFame.has(mlbamId)
		const stints: HistoryStint[] = [...byTeam].map(([teamId, seasons]) => {
			const years = [...seasons]
			const v = value.get(`${mlbamId}:${teamId}`)
			const games = v
				? [...v.games.values()].reduce((sum, g) => sum + g, 0)
				: null
			return {
				teamAbbreviation: MLB_FRANCHISES[Number(teamId)] as string,
				firstSeason: Math.min(...years),
				lastSeason: Math.max(...years),
				seasons: years.length,
				games,
				score: mlbScore(v?.war ?? 0, games ?? 0, hof),
				hallOfFame: hof,
			}
		})
		return {
			sourceId: mlbamId,
			name: person.name,
			position: person.position,
			espnId: espn.get(mlbamId) ?? null,
			imageId: mlbamId,
			headshotUrl: mlbHeadshotUrl(mlbamId),
			active: stints.some((stint) => stint.lastSeason >= latestSeason - 1),
			stints,
		}
	})
}
