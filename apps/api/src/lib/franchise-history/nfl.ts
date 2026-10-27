import { normalizeName } from "../../db/sync/name-match"
import { parseCsv } from "./csv"
import { nflFranchiseTeam } from "./franchise-map"
import { fetchText, mapPool, politeFetch } from "./http"
import {
	HALL_OF_FAME_BONUS,
	type HistoryPlayer,
	type HistoryStint,
	type Log,
} from "./types"
import { sparql } from "./wikidata"

// The NFL's all-time pools, from nflverse's season rosters (1920 on), which
// list every player on every team each season but count no games. Players
// from about 1999 on carry a GSIS id; before that a player is only a name and
// a birth date, which is what keys him. The Hall of Fame comes from Wikidata,
// and draft approximate value (AV with the team that drafted him, 1980 on)
// from nflverse's draft table.

const RELEASES = "https://github.com/nflverse/nflverse-data/releases/download"
const FIRST_SEASON = 1920

export type NflRosterRow = {
	season: number
	team: string
	name: string
	birthDate: string
	gsisId: string
	espnId: string
	pfrId: string
	position: string
	headshotUrl: string
}

export function parseNflRoster(text: string): NflRosterRow[] {
	return parseCsv(text).map((row) => ({
		season: Number(row.season),
		team: row.team ?? "",
		name: row.full_name ?? "",
		birthDate: row.birth_date ?? "",
		gsisId: row.gsis_id ?? "",
		espnId: row.espn_id ?? "",
		pfrId: row.pfr_id ?? "",
		position: row.position ?? "",
		headshotUrl: row.headshot_url ?? "",
	}))
}

// "Johnny Unitas" born 1933-05-07 -> "johnny unitas|1933-05-07". Without a
// birth date, the team code stands in so two same-named players on different
// teams aren't merged.
const nameKey = (row: NflRosterRow) =>
	`${normalizeName(row.name)}|${row.birthDate || row.team}`

export type NflPerson = {
	key: string
	name: string
	birthDate: string
	position: string
	espnId: string
	pfrId: string
	headshotUrl: string
	// Our team abbreviation -> the seasons spent there.
	seasons: Map<string, Set<number>>
}

// Folds roster rows into people. A player whose early rows predate his GSIS
// id is still one person: his name and birth date lead to the id his later
// rows carry. Rows whose code and season map to no franchise today (folded
// teams, the AAFC years) are dropped. Later rows win for name, position and
// photo.
export function nflPeople(rows: NflRosterRow[]): Map<string, NflPerson> {
	const gsisByName = new Map<string, string>()
	// A row with neither id nor birth date (a few recent practice-squad
	// entries) joins the GSIS player of that name, when only one has it.
	const gsisByBareName = new Map<string, string | null>()
	for (const row of rows) {
		if (!row.gsisId) continue
		if (row.birthDate) gsisByName.set(nameKey(row), row.gsisId)
		const bare = normalizeName(row.name)
		const known = gsisByBareName.get(bare)
		gsisByBareName.set(
			bare,
			known === undefined || known === row.gsisId ? row.gsisId : null,
		)
	}
	const people = new Map<string, NflPerson>()
	const ordered = [...rows].sort((a, b) => a.season - b.season)
	for (const row of ordered) {
		const team = nflFranchiseTeam(row.team, row.season)
		if (!team || !row.name) continue
		const key =
			row.gsisId ||
			gsisByName.get(nameKey(row)) ||
			(row.birthDate ? null : gsisByBareName.get(normalizeName(row.name))) ||
			nameKey(row)
		const person = people.get(key) ?? {
			key,
			name: row.name,
			birthDate: row.birthDate,
			position: row.position,
			espnId: "",
			pfrId: "",
			headshotUrl: "",
			seasons: new Map<string, Set<number>>(),
		}
		person.name = row.name
		person.birthDate ||= row.birthDate
		person.position = row.position || person.position
		person.espnId = row.espnId || person.espnId
		person.pfrId = row.pfrId || person.pfrId
		person.headshotUrl = row.headshotUrl || person.headshotUrl
		const seasons = person.seasons.get(team) ?? new Set<number>()
		seasons.add(row.season)
		person.seasons.set(team, seasons)
		people.set(key, person)
	}
	return people
}

export type NflHallOfFamer = { pfrId: string; name: string; birthDate: string }

// Matched by PFR id where the person has one, otherwise by birth date and
// surname, which is how a pre-1999 roster row can be told apart.
export function isNflHallOfFamer(
	person: NflPerson,
	byPfr: Set<string>,
	byBirthDate: Map<string, NflHallOfFamer[]>,
): boolean {
	if (person.pfrId && byPfr.has(person.pfrId)) return true
	const surname = normalizeName(person.name).split(" ").pop() ?? ""
	return (byBirthDate.get(person.birthDate) ?? []).some((hof) =>
		normalizeName(hof.name).includes(surname),
	)
}

// Five points a season with the franchise, the AV he earned for the team
// that drafted him (only on that team's stint), and a Hall of Fame bonus
// worth twenty seasons.
export function nflScore(
	seasons: number,
	draftAv: number,
	hallOfFame: boolean,
) {
	return seasons * 5 + draftAv + (hallOfFame ? HALL_OF_FAME_BONUS.nfl : 0)
}

async function loadHallOfFame(): Promise<NflHallOfFamer[]> {
	const rows = await sparql(`SELECT ?pfr ?dob ?name WHERE {
		?p wdt:P6930 ?hof ; wdt:P3561 ?pfr .
		OPTIONAL { ?p wdt:P569 ?dob }
		OPTIONAL { ?p rdfs:label ?name FILTER(lang(?name) = "en") }
	}`)
	return rows.map((row) => ({
		pfrId: (row.pfr ?? "").split("/").pop() ?? "",
		name: row.name ?? "",
		birthDate: (row.dob ?? "").slice(0, 10),
	}))
}

type DraftValue = { team: string; av: number }

// PFR id -> the franchise that drafted him and his AV there.
async function loadDraftValue(): Promise<Map<string, DraftValue>> {
	const rows = parseCsv(
		await fetchText(`${RELEASES}/draft_picks/draft_picks.csv`),
	)
	const out = new Map<string, DraftValue>()
	for (const row of rows) {
		const team = nflFranchiseTeam(row.team ?? "", Number(row.season))
		if (!team || !row.pfr_player_id) continue
		out.set(row.pfr_player_id, { team, av: Number(row.dr_av) || 0 })
	}
	return out
}

export const espnNflHeadshotUrl = (espnId: string) =>
	`https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`

export async function loadNflHistory(log: Log): Promise<HistoryPlayer[]> {
	const lastSeason = new Date().getUTCFullYear()
	const seasons = Array.from(
		{ length: lastSeason - FIRST_SEASON + 1 },
		(_, i) => FIRST_SEASON + i,
	)
	const files = await mapPool(seasons, 4, async (season) => {
		const res = await politeFetch(`${RELEASES}/rosters/roster_${season}.csv`)
		// The coming season's file doesn't exist until its rosters do.
		if (res.status === 404) return []
		if (!res.ok) throw new Error(`nflverse roster ${season} (${res.status})`)
		return parseNflRoster(await res.text())
	})
	const rows = files.flat()
	const latestSeason = rows.reduce((max, row) => Math.max(max, row.season), 0)
	const people = nflPeople(rows)
	log(`nfl: ${rows.length} roster rows, ${people.size} players`)

	// nflverse's player table fills in the ESPN and PFR ids a GSIS player's
	// roster rows left blank.
	const directory = new Map(
		parseCsv(await fetchText(`${RELEASES}/players/players.csv`)).map((row) => [
			row.gsis_id ?? "",
			row,
		]),
	)
	for (const person of people.values()) {
		const entry = directory.get(person.key)
		if (!entry) continue
		person.espnId ||= entry.espn_id ?? ""
		person.pfrId ||= entry.pfr_id ?? ""
	}

	const hallOfFame = await loadHallOfFame()
	const hofByPfr = new Set(hallOfFame.map((hof) => hof.pfrId))
	const hofByBirthDate = new Map<string, NflHallOfFamer[]>()
	for (const hof of hallOfFame) {
		if (!hof.birthDate) continue
		hofByBirthDate.set(hof.birthDate, [
			...(hofByBirthDate.get(hof.birthDate) ?? []),
			hof,
		])
	}
	const draft = await loadDraftValue()
	log(`nfl: ${hallOfFame.length} Hall of Famers, ${draft.size} draft picks`)

	return [...people.values()].map((person) => {
		const hof = isNflHallOfFamer(person, hofByPfr, hofByBirthDate)
		const drafted = person.pfrId ? draft.get(person.pfrId) : undefined
		const stints: HistoryStint[] = [...person.seasons].map(([team, years]) => {
			const list = [...years]
			const av = drafted?.team === team ? drafted.av : 0
			return {
				teamAbbreviation: team,
				firstSeason: Math.min(...list),
				lastSeason: Math.max(...list),
				seasons: list.length,
				games: null,
				score: nflScore(list.length, av, hof),
				hallOfFame: hof,
			}
		})
		return {
			sourceId: person.key,
			name: person.name,
			position: person.position || null,
			espnId: person.espnId || null,
			imageId: null,
			headshotUrl:
				person.headshotUrl ||
				(person.espnId ? espnNflHeadshotUrl(person.espnId) : null),
			active: stints.some((stint) => stint.lastSeason >= latestSeason - 1),
			stints,
			teamSeasons: [...person.seasons].flatMap(([team, years]) =>
				[...years].map((season) => ({ teamAbbreviation: team, season })),
			),
		}
	})
}
