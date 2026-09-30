import type {
	EspnBoxScoreTeamStat,
	EspnBoxScoreTeamStatGroup,
	EspnGameSummary,
} from "./espn-client"

export type ParsedAthlete = {
	espnTeamId: string
	// ESPN's display name, for naming someone who isn't in our players table.
	name?: string
	didNotPlay: boolean
	// "table.key" -> raw value ("passing.passingYards", "batting.hits"). NBA's
	// one table is unnamed, so its keys carry no prefix ("points").
	stats: Map<string, string>
	notes: { type: string; text: string }[]
}

export type ParsedBoxScore = {
	// Final and fully filled in. ESPN also marks a postponed game "post", and a
	// box score can still be partial for a while after the game ends.
	isFinal: boolean
	scoreByEspnTeamId: Map<string, number>
	// espnTeamId -> stat name -> raw value, from the team box. MLB's grouped
	// stats are keyed "group.name" ("batting.hits").
	teamStats: Map<string, Map<string, string>>
	// espnTeamId -> "table.key" -> that column's team total, from the player
	// tables' totals rows. A column missing here had nobody record it.
	tableTotals: Map<string, Map<string, string>>
	athletes: Map<string, ParsedAthlete>
}

const withPrefix = (prefix: string | null, key: string) =>
	prefix ? `${prefix}.${key}` : key

const isStatGroup = (
	entry: EspnBoxScoreTeamStat | EspnBoxScoreTeamStatGroup,
): entry is EspnBoxScoreTeamStatGroup => "stats" in entry

const rawValue = (stat: EspnBoxScoreTeamStat) =>
	stat.value !== undefined ? String(stat.value) : stat.displayValue

export function parseBoxScore(summary: EspnGameSummary): ParsedBoxScore {
	const competition = summary.header.competitions[0]
	const isFinal =
		competition.status.type.name === "STATUS_FINAL" &&
		competition.status.type.completed &&
		competition.boxscoreSource === "full"

	const scoreByEspnTeamId = new Map<string, number>()
	for (const competitor of competition.competitors) {
		const score = parseStatNumber(competitor.score)
		if (score !== null) scoreByEspnTeamId.set(competitor.id, score)
	}

	const teamStats = new Map<string, Map<string, string>>()
	for (const team of summary.boxscore?.teams ?? []) {
		const stats = new Map<string, string>()
		for (const entry of team.statistics) {
			if (isStatGroup(entry)) {
				for (const stat of entry.stats) {
					stats.set(`${entry.name}.${stat.name}`, rawValue(stat))
				}
			} else {
				stats.set(entry.name, rawValue(entry))
			}
		}
		teamStats.set(team.team.id, stats)
	}

	const tableTotals = new Map<string, Map<string, string>>()
	const athletes = new Map<string, ParsedAthlete>()
	for (const team of summary.boxscore?.players ?? []) {
		const espnTeamId = team.team.id
		const totals = new Map<string, string>()
		for (const table of team.statistics) {
			const prefix = table.name ?? table.type ?? null
			table.keys.forEach((key, i) => {
				const total = table.totals?.[i]
				if (total) totals.set(withPrefix(prefix, key), total)
			})
			for (const entry of table.athletes) {
				const athlete = athletes.get(entry.athlete.id) ?? {
					espnTeamId,
					name: entry.athlete.displayName,
					didNotPlay: false,
					stats: new Map<string, string>(),
					notes: [],
				}
				athlete.didNotPlay ||= entry.didNotPlay === true
				entry.stats.forEach((value, i) => {
					const key = table.keys[i]
					if (key !== undefined)
						athlete.stats.set(withPrefix(prefix, key), value)
				})
				athlete.notes.push(...(entry.notes ?? []))
				athletes.set(entry.athlete.id, athlete)
			}
		}
		tableTotals.set(espnTeamId, totals)
	}
	deriveTotalBases(summary.plays ?? [], athletes)

	return { isFinal, scoreByEspnTeamId, teamStats, tableTotals, athletes }
}

const BASES_PER_HIT: Record<string, number> = {
	Single: 1,
	"Bunt Single": 1,
	Double: 2,
	"Ground Rule Double": 2,
	Triple: 3,
	"Home Run": 4,
}

// ESPN's MLB batting table has no total bases, and no doubles or triples to
// work it out from, so it's counted off the play-by-play's hits and stored as
// "batting.totalBases" like any other cell. ESPN sometimes logs one ball in
// play twice within an at-bat, so each at-bat counts its last hit only. A
// batter whose hits there don't add up to the table's H gets no value rather
// than a wrong one, which leaves a question on it for a person instead of
// settling it short.
function deriveTotalBases(
	plays: NonNullable<EspnGameSummary["plays"]>,
	athletes: Map<string, ParsedAthlete>,
): void {
	const hitByAtBat = new Map<string, { batter: string; bases: number }>()
	plays.forEach((play, index) => {
		const perHit = BASES_PER_HIT[play.type?.text ?? ""]
		if (perHit === undefined) return
		const batters = (play.participants ?? []).filter((p) => p.type === "batter")
		if (batters.length !== 1 || !batters[0]) return
		hitByAtBat.set(play.atBatId ?? `play:${index}`, {
			batter: batters[0].athlete.id,
			bases: perHit,
		})
	})
	const hits = new Map<string, number>()
	const bases = new Map<string, number>()
	for (const hit of hitByAtBat.values()) {
		hits.set(hit.batter, (hits.get(hit.batter) ?? 0) + 1)
		bases.set(hit.batter, (bases.get(hit.batter) ?? 0) + hit.bases)
	}
	for (const [id, athlete] of athletes) {
		const tableHits = parseStatNumber(athlete.stats.get("batting.hits"))
		if (tableHits === null || tableHits !== (hits.get(id) ?? 0)) continue
		athlete.stats.set("batting.totalBases", String(bases.get(id) ?? 0))
	}
}

// A plain number, or null for ESPN's blanks ("", "--") and anything else that
// isn't one.
export function parseStatNumber(raw: string | undefined): number | null {
	const trimmed = raw?.trim()
	if (!trimmed || trimmed === "--") return null
	const value = Number(trimmed)
	return Number.isFinite(value) ? value : null
}

// The made side of a "made-attempted" pair: "2-5" -> 2.
export function parseMadeAttempted(raw: string | undefined): number | null {
	return parseStatNumber(raw?.split("-")[0])
}

// Baseball innings, where the digit after the point counts outs rather than
// tenths: "5.2" is five and two-thirds.
export function parseInnings(raw: string | undefined): number | null {
	const trimmed = raw?.trim()
	if (!trimmed) return null
	const [whole, outs = "0"] = trimmed.split(".")
	const innings = Number(whole)
	const extraOuts = Number(outs)
	if (!Number.isInteger(innings) || !Number.isInteger(extraOuts)) return null
	return innings + extraOuts / 3
}

// How a box-score cell should be read when no extractor claims its key - i.e.
// for the long tail of columns no catalog stat is defined against, which are
// stored anyway (see db/schema/box-scores.ts) and which a plain Number() would
// silently get wrong for two of ESPN's encodings.
//
// This keys off the column name's own shape, not off any stat, because it's a
// property of the feed rather than of the catalog: ESPN names a paired column
// "made-attempted" ("hits-atBats", "pitches-strikes") and names a baseball
// innings column "fullInnings.partInnings" wherever either appears. An
// extractor's own `source.parse` still wins where there is one, so a stat that
// settles questions is always read exactly as resolution reads it.
export function defaultStatParser(
	statKey: string,
): (raw: string | undefined) => number | null {
	if (statKey.endsWith("fullInnings.partInnings")) return parseInnings
	const column = statKey.split(".").pop() ?? statKey
	if (column.includes("-")) return parseMadeAttempted
	return parseStatNumber
}

// Rate stats settle against lines with three decimals, so a computed rate is
// compared at that precision.
export function roundToThousandths(value: number): number {
	return Math.round(value * 1000) / 1000
}
