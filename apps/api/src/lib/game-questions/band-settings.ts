import type { ToleranceSpec } from "@called-my-shot/scoring"
import { and, eq } from "drizzle-orm"
import { db } from "../../db"
import {
	type GameQuestionBandSetting,
	gameQuestionBandSettings,
} from "../../db/schema"
import { numericToleranceFor } from "../numeric-tolerance"
import {
	type BandTemplate,
	bandFor,
	bandTemplates,
	callerHits,
	hitRate,
	type ScoreSample,
	scoreSamples,
	TARGET_HIT_RATE,
	TARGET_SPREAD,
} from "./band-calibration"

export type BandCalibration = {
	// Team scores the band is read over.
	samples: number
	// How often a guess at the team's own average landed inside the band in
	// use now.
	hitRate: number | null
	// The band that guess would have hit TARGET_HIT_RATE of the time with.
	suggestedBand: number | null
	targetHitRate: number
	outsideTarget: boolean
	callerCalls: number
	callerHitRate: number | null
}

// One league stat as the admin Bands page shows it: the band its questions
// are created with now, the catalog's own, whether tuneBands is moving it,
// and how it lands against recent final scores.
export type BandSettingRow = {
	leagueSlug: string
	templateId: string
	statName: string
	// Null only when the league or stat hasn't synced yet.
	tolerance: ToleranceSpec | null
	defaultTolerance: ToleranceSpec | null
	isCustom: boolean
	autoTune: boolean
	tunedAt: Date | null
	calibration: BandCalibration
}

// The league and catalog stat a template's questions are about, and the band
// the catalog gives a team question on that stat.
export async function templateStat(template: BandTemplate) {
	const league = await db.query.leagues.findFirst({
		where: { slug: template.leagueSlug },
		columns: { id: true, sportId: true },
	})
	if (!league) return null
	const stat = await db.query.stats.findFirst({
		where: { sportId: league.sportId, name: template.statName },
		with: { toleranceTier: true, teamToleranceTier: true },
	})
	if (!stat) return null
	const tolerance = numericToleranceFor("team_stat_numeric_guess", stat)
	const defaultTolerance: ToleranceSpec | null = !tolerance
		? null
		: tolerance.numericToleranceAbsolute !== null
			? { mode: "absolute", amount: tolerance.numericToleranceAbsolute }
			: { mode: "percentage", pct: tolerance.numericTolerancePct as number }
	return { leagueId: league.id, statId: stat.id, defaultTolerance }
}

async function rowFor(
	template: BandTemplate,
	saved: GameQuestionBandSetting | undefined,
	samples: ScoreSample[],
): Promise<BandSettingRow> {
	const found = await templateStat(template)
	const defaultTolerance = found?.defaultTolerance ?? null
	const tolerance: ToleranceSpec | null = saved
		? { mode: "absolute", amount: saved.band }
		: defaultTolerance
	const callers = found
		? await callerHits(found.leagueId, found.statId)
		: { calls: 0, hitRate: null }
	const rate = tolerance ? hitRate(samples, tolerance) : null
	return {
		...template,
		tolerance,
		defaultTolerance,
		isCustom: !!saved,
		autoTune: saved?.autoTune ?? true,
		tunedAt: saved?.tunedAt ?? null,
		calibration: {
			samples: samples.length,
			hitRate: rate,
			suggestedBand: bandFor(samples),
			targetHitRate: TARGET_HIT_RATE,
			outsideTarget:
				rate !== null && Math.abs(rate - TARGET_HIT_RATE) > TARGET_SPREAD,
			callerCalls: callers.calls,
			callerHitRate: callers.hitRate,
		},
	}
}

// Every tuned league stat, in catalog order.
export async function bandSettingRows(
	now = new Date(),
): Promise<BandSettingRow[]> {
	const saved = await db.select().from(gameQuestionBandSettings)
	const rows: BandSettingRow[] = []
	for (const template of bandTemplates()) {
		const row = saved.find(
			(s) =>
				s.leagueSlug === template.leagueSlug &&
				s.statName === template.statName,
		)
		rows.push(
			await rowFor(template, row, await scoreSamples(template.leagueSlug, now)),
		)
	}
	return rows
}

export async function bandSettingRow(
	leagueSlug: string,
	statName: string,
): Promise<BandSettingRow | undefined> {
	return (await bandSettingRows()).find(
		(row) => row.leagueSlug === leagueSlug && row.statName === statName,
	)
}

// A league's saved bands by stat name.
export async function loadBandSettings(
	leagueSlug: string,
): Promise<Map<string, number>> {
	const rows = await db
		.select()
		.from(gameQuestionBandSettings)
		.where(eq(gameQuestionBandSettings.leagueSlug, leagueSlug))
	return new Map(rows.map((row) => [row.statName, row.band]))
}

// The saved band for one league stat, or null to use the catalog's.
export async function bandSettingFor(
	leagueId: string,
	statName: string,
): Promise<number | null> {
	const league = await db.query.leagues.findFirst({
		where: { id: leagueId },
		columns: { slug: true },
	})
	if (!league) return null
	return (await loadBandSettings(league.slug)).get(statName) ?? null
}

// Back to the catalog's band, tuned automatically.
export async function resetBandSetting(
	leagueSlug: string,
	statName: string,
): Promise<void> {
	await db
		.delete(gameQuestionBandSettings)
		.where(
			and(
				eq(gameQuestionBandSettings.leagueSlug, leagueSlug),
				eq(gameQuestionBandSettings.statName, statName),
			),
		)
}

export async function saveBandSetting(
	input: {
		leagueSlug: string
		statName: string
		band: number
		autoTune: boolean
	},
	updatedById: string,
): Promise<void> {
	const values = {
		band: input.band,
		autoTune: input.autoTune,
		updatedById,
		updatedAt: new Date(),
	}
	await db
		.insert(gameQuestionBandSettings)
		.values({
			leagueSlug: input.leagueSlug,
			statName: input.statName,
			...values,
		})
		.onConflictDoUpdate({
			target: [
				gameQuestionBandSettings.leagueSlug,
				gameQuestionBandSettings.statName,
			],
			set: values,
		})
}
