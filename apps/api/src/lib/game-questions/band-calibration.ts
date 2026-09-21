import {
	breakEvenHitRate,
	hitTolerance,
	LOSS_RATE_BY_SHAPE,
	type ToleranceSpec,
	toleranceBand,
} from "@called-my-shot/scoring"
import { db } from "../../db"
import { median } from "./tune-lines"

// A team numeric guess breaks even when it hits this often - see
// breakEvenHitRate. A band is on target within TARGET_SPREAD either side.
export const TARGET_HIT_RATE = breakEvenHitRate(
	LOSS_RATE_BY_SHAPE.team_stat_numeric_guess,
)
export const TARGET_SPREAD = 0.05

export const BAND_TUNING = {
	// The fewest team scores a band is tuned from.
	minSample: 60,
	// The most recent team scores a band is read over, so it follows how the
	// league scores now rather than all-time.
	window: 300,
	// A team's score only counts once it has this many earlier final games
	// that season to average, so opening week isn't measured against nothing.
	minPriorGames: 3,
	// How far back final games are read. Two seasons covers the window in
	// every league without reading the whole history.
	lookbackDays: 730,
	// The most a band moves in one run, as a share of the current band and
	// never less than 1, so a run of blowouts can't swing it at once.
	maxStepShare: 0.2,
	minBand: 1,
}

// One team's final score and the guess it's measured against: that team's
// average over its earlier final games that season, rounded to the whole
// number a caller would type. The guess doesn't depend on any band, so every
// final game counts, including ones from before a band change.
export type ScoreSample = { actual: number; reference: number }

// The league stats a band is tuned for: each asks for a team's final score
// (points, runs), which is what games.homeScore/awayScore hold. The generator
// doesn't post team numeric guesses, but a caller can still ask one, and it's
// created with the band tuned here (see bandSettingFor).
export type BandTemplate = {
	leagueSlug: string
	templateId: string
	statName: string
}

const BAND_TEMPLATES: BandTemplate[] = [
	{ leagueSlug: "nfl", templateId: "team-points", statName: "Points" },
	{ leagueSlug: "nba", templateId: "team-points", statName: "Points" },
	{ leagueSlug: "mlb", templateId: "team-runs", statName: "Runs" },
]

export function bandTemplates(): BandTemplate[] {
	return BAND_TEMPLATES
}

export function bandTemplate(
	leagueSlug: string,
	statName: string,
): BandTemplate | undefined {
	return bandTemplates().find(
		(template) =>
			template.leagueSlug === leagueSlug && template.statName === statName,
	)
}

type FinalGame = {
	seasonId: string
	homeTeamId: string
	awayTeamId: string
	homeScore: number | null
	awayScore: number | null
	startsAt: Date
}

// Every team score with enough earlier games behind it, most recent first.
export function samplesFrom(games: FinalGame[]): ScoreSample[] {
	const history = new Map<string, number[]>()
	const samples: ScoreSample[] = []
	const ordered = [...games].sort(
		(a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
	)
	for (const game of ordered) {
		if (game.homeScore === null || game.awayScore === null) continue
		const sides = [
			[game.homeTeamId, game.homeScore],
			[game.awayTeamId, game.awayScore],
		] as const
		for (const [teamId, score] of sides) {
			const key = `${game.seasonId}:${teamId}`
			const prior = history.get(key) ?? []
			if (prior.length >= BAND_TUNING.minPriorGames) {
				const mean = prior.reduce((sum, value) => sum + value, 0) / prior.length
				samples.push({ actual: score, reference: Math.round(mean) })
			}
			prior.push(score)
			history.set(key, prior)
		}
	}
	return samples.reverse()
}

// A league's most recent team scores, at most BAND_TUNING.window of them.
export async function scoreSamples(
	leagueSlug: string,
	now = new Date(),
): Promise<ScoreSample[]> {
	const league = await db.query.leagues.findFirst({
		where: { slug: leagueSlug },
		columns: { id: true },
	})
	if (!league) return []
	const since = new Date(
		now.getTime() - BAND_TUNING.lookbackDays * 24 * 60 * 60 * 1000,
	)
	const finals = await db.query.games.findMany({
		where: { leagueId: league.id, status: "final", startsAt: { gte: since } },
		columns: {
			seasonId: true,
			homeTeamId: true,
			awayTeamId: true,
			homeScore: true,
			awayScore: true,
			startsAt: true,
		},
	})
	return samplesFrom(finals).slice(0, BAND_TUNING.window)
}

// How often the reference guess landed inside a band, by the same rule a real
// guess is scored on.
export function hitRate(
	samples: ScoreSample[],
	spec: ToleranceSpec,
): number | null {
	if (samples.length === 0) return null
	const hits = samples.filter((sample) =>
		hitTolerance(sample.reference, sample.actual, spec),
	).length
	return hits / samples.length
}

// The narrowest whole-number band the reference guess lands inside at least
// `target` of the time.
export function bandFor(
	samples: ScoreSample[],
	target = TARGET_HIT_RATE,
): number | null {
	if (samples.length === 0) return null
	const misses = samples
		.map((sample) => Math.abs(sample.actual - sample.reference))
		.sort((a, b) => a - b)
	// Nudged down so float noise in target x length (a third of 300 comes out
	// a hair over 100) can't push the index one sample too far.
	const index = Math.max(0, Math.ceil(target * misses.length - 1e-9) - 1)
	return Math.max(BAND_TUNING.minBand, misses[index] as number)
}

// A band in the stat's own unit: an absolute band as is, a percentage band as
// it comes out on a typical score. Null with no scores to read a typical one
// from.
export function absoluteBand(
	spec: ToleranceSpec,
	samples: ScoreSample[],
): number | null {
	if (spec.mode === "absolute") return spec.amount
	const typical = median(samples.map((sample) => sample.actual))
	return typical === null ? null : toleranceBand(typical, spec)
}

// The band to move to from `current`, or null to leave it: too few scores to
// go on, or already where they point.
export function nextBand(
	current: number,
	samples: ScoreSample[],
): number | null {
	if (samples.length < BAND_TUNING.minSample) return null
	const target = bandFor(samples)
	if (target === null) return null
	const step = Math.max(1, Math.round(current * BAND_TUNING.maxStepShare))
	const stepped = Math.min(current + step, Math.max(current - step, target))
	const band = Math.max(BAND_TUNING.minBand, stepped)
	return band === current ? null : band
}

// Real calls on resolved team numeric guesses for one league stat. For
// comparison only: with a handful of callers this says little, and it mixes
// in how good the callers are.
export async function callerHits(
	leagueId: string,
	statId: string,
): Promise<{ calls: number; hitRate: number | null }> {
	const rows = await db.query.calls.findMany({
		where: {
			hitTolerance: { isNotNull: true },
			question: {
				leagueId,
				statId,
				shape: "team_stat_numeric_guess",
				status: "resolved",
			},
		},
		columns: { hitTolerance: true },
	})
	const hits = rows.filter((row) => row.hitTolerance === true).length
	return {
		calls: rows.length,
		hitRate: rows.length === 0 ? null : hits / rows.length,
	}
}
