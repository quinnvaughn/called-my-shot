import { eq } from "drizzle-orm"
import { db } from "../../db"
import { gameQuestionLossSettings } from "../../db/schema"
import {
	blendedHitRate,
	DEFAULT_LEADER_LOSS_RATE,
	favoriteResultsByTemplate,
	leaderTemplates,
	nextLossRate,
} from "./leader-calibration"
import { sumHits } from "./pooling"

// Moves every league stat's leader loss rate left on automatic toward where a
// pick on the favorite breaks even. Returns how many rates moved.
export async function tuneLeaderLosses(now = new Date()): Promise<number> {
	const [saved, resultsByTemplate] = await Promise.all([
		db.select().from(gameQuestionLossSettings),
		favoriteResultsByTemplate(),
	])
	const pool = sumHits(resultsByTemplate.values())

	let tuned = 0
	for (const template of leaderTemplates()) {
		const key = `${template.leagueSlug}:${template.statName}`
		const row = saved.find(
			(s) =>
				s.leagueSlug === template.leagueSlug &&
				s.statName === template.statName,
		)
		if (row && !row.autoTune) continue
		const current = row?.lossRate ?? DEFAULT_LEADER_LOSS_RATE
		const results =
			resultsByTemplate.get(`${template.leagueSlug}:${template.templateId}`) ??
			[]
		const lossRate = nextLossRate(
			current,
			blendedHitRate(results, pool),
			pool.total,
		)
		if (lossRate === null) continue

		// The conflict update only lands on a row still on automatic, so an
		// admin switching the rate to manual mid-run keeps theirs.
		await db
			.insert(gameQuestionLossSettings)
			.values({
				leagueSlug: template.leagueSlug,
				statName: template.statName,
				lossRate,
				autoTune: true,
				tunedAt: now,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: [
					gameQuestionLossSettings.leagueSlug,
					gameQuestionLossSettings.statName,
				],
				set: { lossRate, tunedAt: now, updatedAt: now },
				setWhere: eq(gameQuestionLossSettings.autoTune, true),
			})
		console.log(
			`[tune-leader-losses] ${key}: loss rate ${current} -> ${lossRate}`,
		)
		tuned++
	}
	console.log(`[tune-leader-losses] done, ${tuned} rate(s) tuned`)
	return tuned
}
