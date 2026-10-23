import type { RankItem } from "../../db/schema"
import type { SeasonLeague } from "../season-puzzles/archive-parse"
import { seasonLabel } from "../season-puzzles/archive-parse"
import {
	formatRankValue,
	type PlayerRankStat,
	SCORING_WORD,
} from "./rank-stats"

// Building one Blind Rank puzzle from a pool: five things with values far
// enough apart that no ranking hinges on a rounding, in a random reveal
// order. Pure, so each kind's rules are testable.

export const RANK_ITEM_COUNT = 5
// Two values closer than this share of the larger aren't both used.
export const RANK_MIN_GAP = 0.02
// A career prompt draws from this many of a stat's career leaders, so the
// names are ones people know.
export const CAREER_POOL_SIZE = 40

export type RankKind =
	| "season_stat"
	| "career_stat"
	| "team_season"
	| "franchise"

export type GeneratedRank = {
	kind: RankKind
	prompt: string
	context: string
	items: RankItem[]
	signature: string
}

type Candidate = Omit<RankItem, "display"> & { key: string; display: string }

function shuffled<T>(list: readonly T[], random: () => number): T[] {
	const out = [...list]
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1))
		const a = out[i]
		const b = out[j]
		if (a === undefined || b === undefined) continue
		out[i] = b
		out[j] = a
	}
	return out
}

function tooClose(a: number, b: number): boolean {
	const larger = Math.max(Math.abs(a), Math.abs(b))
	return larger === 0 ? true : Math.abs(a - b) < RANK_MIN_GAP * larger
}

// Five candidates, in a random order, no two too close in value. Null when
// the pool can't give five.
export function pickFive(
	candidates: readonly Candidate[],
	random: () => number,
): Candidate[] | null {
	const picked: Candidate[] = []
	for (const candidate of shuffled(candidates, random)) {
		if (picked.some((p) => tooClose(p.value, candidate.value))) continue
		picked.push(candidate)
		if (picked.length === RANK_ITEM_COUNT) return picked
	}
	return null
}

const toItems = (picked: Candidate[]): RankItem[] =>
	picked.map(({ label, sublabel, teamId, value, display }) => ({
		label,
		sublabel,
		teamId,
		value,
		display,
	}))

const leagueName = (league: SeasonLeague) => league.toUpperCase()

export const seasonContext = (league: SeasonLeague, year: number) =>
	`${seasonLabel(league, year)} ${leagueName(league)} season`

// Players by one stat in one season, from that season's leaderboard.
export function seasonStatPuzzle(
	league: SeasonLeague,
	stat: PlayerRankStat,
	year: number,
	leaders: readonly {
		espnAthleteId: string
		athlete: string
		teamId: string | null
		teamName: string | null
		value: number
	}[],
	random: () => number,
): GeneratedRank | null {
	const picked = pickFive(
		leaders.map((l) => ({
			key: l.espnAthleteId,
			label: l.athlete,
			sublabel: l.teamName,
			teamId: l.teamId,
			value: l.value,
			display: formatRankValue(l.value, stat.seasonDecimals),
		})),
		random,
	)
	if (!picked) return null
	return {
		kind: "season_stat",
		prompt: stat.seasonLabel,
		context: seasonContext(league, year),
		items: toItems(picked),
		signature: `season_stat:${league}:${stat.category}:${year}`,
	}
}

// Players by a career total, from the stat's career leaders.
export function careerStatPuzzle(
	league: SeasonLeague,
	stat: PlayerRankStat,
	careers: readonly {
		espnAthleteId: string
		athlete: string
		teamId: string | null
		stats: Record<string, number>
	}[],
	// Each player's team, by the name it had while they led it.
	teamNames: ReadonlyMap<string, string>,
	random: () => number,
): GeneratedRank | null {
	const pool = careers
		.flatMap((c) => {
			const value = c.stats[stat.careerKey]
			return typeof value === "number" && value > 0 ? [{ ...c, value }] : []
		})
		.sort((a, b) => b.value - a.value)
		.slice(0, CAREER_POOL_SIZE)
	const picked = pickFive(
		pool.map((c) => ({
			key: c.espnAthleteId,
			label: c.athlete,
			sublabel: teamNames.get(c.espnAthleteId) ?? null,
			teamId: c.teamId,
			value: c.value,
			display: formatRankValue(c.value, 0),
		})),
		random,
	)
	if (!picked) return null
	return {
		kind: "career_stat",
		prompt: stat.careerLabel,
		context: leagueName(league),
		items: toItems(picked),
		signature: `career_stat:${league}:${stat.careerKey}:${picked
			.map((p) => p.key)
			.sort()
			.join(",")}`,
	}
}

export type TeamSeasonStat = "wins" | "pointsFor" | "pointsAgainst"
export const TEAM_SEASON_STATS: TeamSeasonStat[] = [
	"wins",
	"pointsFor",
	"pointsAgainst",
]

// The NBA's scoring reads per game; the other leagues' as season totals.
function teamStatLabel(league: SeasonLeague, stat: TeamSeasonStat): string {
	if (stat === "wins") return "Wins"
	const word = SCORING_WORD[league]
	const side = stat === "pointsFor" ? "scored" : "allowed"
	return league === "nba" ? `${word} ${side} per game` : `${word} ${side}`
}

// Teams by one stat in one season, from the Name That Season archive.
export function teamSeasonPuzzle(
	league: SeasonLeague,
	stat: TeamSeasonStat,
	year: number,
	seasons: readonly {
		teamId: string
		name: string
		wins: number
		losses: number
		ties: number
		otLosses: number
		pointsFor: number
		pointsAgainst: number
	}[],
	random: () => number,
): GeneratedRank | null {
	const perGame = league === "nba" && stat !== "wins"
	const candidates = seasons.flatMap((s) => {
		const games = s.wins + s.losses + s.ties + s.otLosses
		const total = s[stat]
		// Older NBA standings carry no point totals.
		if (stat !== "wins" && total <= 0) return []
		const value = perGame ? (games > 0 ? total / games : 0) : total
		return [
			{
				key: s.teamId,
				label: s.name,
				sublabel: null,
				teamId: s.teamId,
				value,
				display: formatRankValue(value, perGame ? 1 : 0),
			},
		]
	})
	const picked = pickFive(candidates, random)
	if (!picked) return null
	return {
		kind: "team_season",
		prompt: teamStatLabel(league, stat),
		context: seasonContext(league, year),
		items: toItems(picked),
		signature: `team_season:${league}:${stat}:${year}`,
	}
}

export type FranchiseStat = "titles" | "playoffs"
// The share of the archive's seasons a franchise needs to be in a franchise
// prompt at all.
export const FRANCHISE_MIN_TENURE = 0.75
export const FRANCHISE_STATS: FranchiseStat[] = ["titles", "playoffs"]

// Franchises by a count across every archived season of their league.
export function franchisePuzzle(
	league: SeasonLeague,
	stat: FranchiseStat,
	seasons: readonly { teamId: string; year: number; outcome: string }[],
	teamNames: ReadonlyMap<string, string>,
	random: () => number,
): GeneratedRank | null {
	if (seasons.length === 0) return null
	const firstYear = Math.min(...seasons.map((s) => s.year))
	const span = new Set(seasons.map((s) => s.year)).size
	const tenure = new Map<string, number>()
	for (const s of seasons) tenure.set(s.teamId, (tenure.get(s.teamId) ?? 0) + 1)
	const counts = new Map<string, number>()
	for (const s of seasons) {
		// A franchise that hasn't been around most of the span can't fairly
		// be counted against those that have.
		if ((tenure.get(s.teamId) ?? 0) < FRANCHISE_MIN_TENURE * span) continue
		const counted =
			stat === "titles" ? s.outcome === "champion" : s.outcome !== "missed"
		counts.set(s.teamId, (counts.get(s.teamId) ?? 0) + (counted ? 1 : 0))
	}
	const picked = pickFive(
		[...counts.entries()].flatMap(([teamId, value]) => {
			const name = teamNames.get(teamId)
			return name
				? [
						{
							key: teamId,
							label: name,
							sublabel: null,
							teamId,
							value,
							display: formatRankValue(value, 0),
						},
					]
				: []
		}),
		random,
	)
	if (!picked) return null
	return {
		kind: "franchise",
		prompt: stat === "titles" ? "Titles" : "Playoff appearances",
		context: `${leagueName(league)} since ${seasonLabel(league, firstYear)}`,
		items: toItems(picked),
		signature: `franchise:${league}:${stat}:${picked
			.map((p) => p.key)
			.sort()
			.join(",")}`,
	}
}
