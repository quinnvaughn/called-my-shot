import { eq } from "drizzle-orm"
import { db } from "../../db"
import { gameQuestionBandSettings } from "../../db/schema"
import {
	absoluteBand,
	BAND_TUNING,
	bandTemplates,
	nextBand,
	scoreSamples,
} from "./band-calibration"
import { templateStat } from "./band-settings"

// Moves every league stat left on automatic toward the band a guess at a
// team's own average hits at break-even (see TARGET_HIT_RATE). Returns how
// many bands moved.
export async function tuneBands(now = new Date()): Promise<number> {
	const saved = await db.select().from(gameQuestionBandSettings)

	let tuned = 0
	for (const template of bandTemplates()) {
		const key = `${template.leagueSlug}:${template.statName}`
		const row = saved.find(
			(s) =>
				s.leagueSlug === template.leagueSlug &&
				s.statName === template.statName,
		)
		if (row && !row.autoTune) continue

		const samples = await scoreSamples(template.leagueSlug, now)
		if (samples.length < BAND_TUNING.minSample) continue
		const defaultTolerance = row
			? null
			: ((await templateStat(template))?.defaultTolerance ?? null)
		const current =
			row?.band ??
			(defaultTolerance ? absoluteBand(defaultTolerance, samples) : null)
		if (current === null) continue
		const band = nextBand(current, samples)
		if (band === null) continue

		// The conflict update only lands on a row still on automatic, so an
		// admin switching the band to manual mid-run keeps theirs.
		await db
			.insert(gameQuestionBandSettings)
			.values({
				leagueSlug: template.leagueSlug,
				statName: template.statName,
				band,
				autoTune: true,
				tunedAt: now,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: [
					gameQuestionBandSettings.leagueSlug,
					gameQuestionBandSettings.statName,
				],
				set: { band, tunedAt: now, updatedAt: now },
				setWhere: eq(gameQuestionBandSettings.autoTune, true),
			})
		console.log(`[tune-bands] ${key}: band ${current} -> ${band}`)
		tuned++
	}
	console.log(`[tune-bands] done, ${tuned} band(s) tuned`)
	return tuned
}
