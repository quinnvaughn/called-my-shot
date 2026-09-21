import type { ToleranceSpec } from "@called-my-shot/scoring"
import { gameQuestionBandSettings } from "../../db/schema"
import { numericToleranceFor } from "../numeric-tolerance"
import {
	absoluteBand,
	type BandTemplate,
	bandFor,
	bandTemplates,
	callerHits,
	hitRate,
	nextBand,
	type ScoreSample,
	scoreSamples,
	TARGET_HIT_RATE,
	TARGET_SPREAD,
} from "./band-calibration"
import {
	defineTunableSetting,
	type LeagueStatLookup,
	leagueStatLookup,
	type SettingState,
} from "./tunable-setting"

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
export type BandSettingRow = BandTemplate &
	SettingState & {
		// Null only when the league or stat hasn't synced yet.
		tolerance: ToleranceSpec | null
		defaultTolerance: ToleranceSpec | null
		calibration: BandCalibration
	}

type BandContext = {
	samples: Map<string, ScoreSample[]>
	lookup: LeagueStatLookup
}

// Each league's recent team scores and the league stats the templates are
// about.
async function loadContext(
	templates: BandTemplate[],
	now: Date,
): Promise<BandContext> {
	const leagueSlugs = [...new Set(templates.map((t) => t.leagueSlug))]
	const [samples, lookup] = await Promise.all([
		Promise.all(leagueSlugs.map((slug) => scoreSamples(slug, now))),
		leagueStatLookup(templates),
	])
	return {
		samples: new Map(leagueSlugs.map((slug, i) => [slug, samples[i] ?? []])),
		lookup,
	}
}

// The band the catalog gives a team question on the template's stat.
function defaultTolerance(
	template: BandTemplate,
	ctx: BandContext,
): ToleranceSpec | null {
	const found = ctx.lookup.stat(template.leagueSlug, template.statName)
	const tolerance = found
		? numericToleranceFor("team_stat_numeric_guess", found.stat)
		: null
	if (!tolerance) return null
	return tolerance.numericToleranceAbsolute !== null
		? { mode: "absolute", amount: tolerance.numericToleranceAbsolute }
		: { mode: "percentage", pct: tolerance.numericTolerancePct as number }
}

const samplesOf = (template: BandTemplate, ctx: BandContext) =>
	ctx.samples.get(template.leagueSlug) ?? []

// Each league stat's team numeric guess band, tuned toward the band a guess
// at a team's own average hits at break-even (see TARGET_HIT_RATE).
export const bandSettings = defineTunableSetting({
	table: gameQuestionBandSettings,
	keyField: "statName",
	tunedField: "band",
	templates: bandTemplates,
	keyOf: (template) => template.statName,
	valueOf: (saved) => saved.band,
	tune: {
		job: "tune-bands",
		label: "band",
		unit: "band(s)",
		load: (now) => loadContext(bandTemplates(), now),
		defaultValue: (template, ctx) => {
			const spec = defaultTolerance(template, ctx)
			return spec ? absoluteBand(spec, samplesOf(template, ctx)) : null
		},
		next: (current, template, ctx) =>
			nextBand(current, samplesOf(template, ctx)),
	},
	rows: {
		load: loadContext,
		build: async (
			template,
			saved,
			ctx,
		): Promise<Omit<BandSettingRow, keyof SettingState>> => {
			const samples = samplesOf(template, ctx)
			const found = ctx.lookup.stat(template.leagueSlug, template.statName)
			const catalog = defaultTolerance(template, ctx)
			const tolerance: ToleranceSpec | null = saved
				? { mode: "absolute", amount: saved.band }
				: catalog
			const callers = found
				? await callerHits(found.leagueId, found.stat.id)
				: { calls: 0, hitRate: null }
			const rate = tolerance ? hitRate(samples, tolerance) : null
			return {
				...template,
				tolerance,
				defaultTolerance: catalog,
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
		},
	},
})

export const loadBandSettings = bandSettings.loadLeague
export const bandSettingFor = bandSettings.valueFor
