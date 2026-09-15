import { eq } from "drizzle-orm"
import { db } from "../../db"
import { titleLossSettings } from "../../db/schema"
import { sumHits } from "./pooling"
import {
	bestRecordResultsByGroup,
	blendedTitleHitRate,
	DEFAULT_TITLE_LOSS_RATE,
	nextTitleLossRate,
	titleGroups,
} from "./title-calibration"

// Moves every league title's loss rate left on automatic toward where a pick
// on the best record breaks even. Returns how many rates moved.
export async function tuneTitleLosses(now = new Date()): Promise<number> {
	const [saved, resultsByGroup] = await Promise.all([
		db.select().from(titleLossSettings),
		bestRecordResultsByGroup(),
	])
	const pool = sumHits(resultsByGroup.values())

	let tuned = 0
	for (const group of titleGroups()) {
		const key = `${group.leagueSlug}:${group.awardName}`
		const row = saved.find(
			(s) =>
				s.leagueSlug === group.leagueSlug && s.awardName === group.awardName,
		)
		if (row && !row.autoTune) continue
		const current = row?.lossRate ?? DEFAULT_TITLE_LOSS_RATE
		const lossRate = nextTitleLossRate(
			current,
			blendedTitleHitRate(resultsByGroup.get(key) ?? [], pool),
			pool.total,
		)
		if (lossRate === null) continue

		// The conflict update only lands on a row still on automatic, so an
		// admin switching the rate to manual mid-run keeps theirs.
		await db
			.insert(titleLossSettings)
			.values({
				leagueSlug: group.leagueSlug,
				awardName: group.awardName,
				lossRate,
				autoTune: true,
				tunedAt: now,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: [titleLossSettings.leagueSlug, titleLossSettings.awardName],
				set: { lossRate, tunedAt: now, updatedAt: now },
				setWhere: eq(titleLossSettings.autoTune, true),
			})
		console.log(
			`[tune-title-losses] ${key}: loss rate ${current} -> ${lossRate}`,
		)
		tuned++
	}
	console.log(`[tune-title-losses] done, ${tuned} rate(s) tuned`)
	return tuned
}
