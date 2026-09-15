import { and, eq } from "drizzle-orm"
import { db } from "../../db"
import { titleLossSettings } from "../../db/schema"
import { sumHits } from "./pooling"
import {
	bestRecordHitRate,
	bestRecordResultsByGroup,
	blendedTitleHitRate,
	callerTitleHits,
	DEFAULT_TITLE_LOSS_RATE,
	suggestedTitleLossRate,
	type TitleGroup,
	titleGroups,
} from "./title-calibration"

export type TitleLossCalibration = {
	// This league title's resolved questions with a record to read, within
	// the tuning window.
	resolved: number
	// How often the best record won those.
	bestRecordHitRate: number | null
	// That record leaning on every other league title's while it's small -
	// what the rate is tuned from.
	blendedHitRate: number | null
	suggestedLossRate: number | null
	callerPicks: number
	callerHitRate: number | null
}

// One league title as the admin Titles page shows it.
export type TitleLossSettingRow = TitleGroup & {
	lossRate: number
	defaultLossRate: number
	isCustom: boolean
	autoTune: boolean
	tunedAt: Date | null
	calibration: TitleLossCalibration
}

// Every tuned league title, in catalog order.
export async function titleLossSettingRows(): Promise<TitleLossSettingRow[]> {
	const [saved, resultsByGroup] = await Promise.all([
		db.select().from(titleLossSettings),
		bestRecordResultsByGroup(),
	])
	const pool = sumHits(resultsByGroup.values())
	const rows: TitleLossSettingRow[] = []
	for (const group of titleGroups()) {
		const row = saved.find(
			(s) =>
				s.leagueSlug === group.leagueSlug && s.awardName === group.awardName,
		)
		const results =
			resultsByGroup.get(`${group.leagueSlug}:${group.awardName}`) ?? []
		const blended = blendedTitleHitRate(results, pool)
		const league = await db.query.leagues.findFirst({
			where: { slug: group.leagueSlug },
			columns: { id: true },
		})
		const callers = league
			? await callerTitleHits(league.id, group.awardName)
			: { picks: 0, hitRate: null }
		rows.push({
			...group,
			lossRate: row?.lossRate ?? DEFAULT_TITLE_LOSS_RATE,
			defaultLossRate: DEFAULT_TITLE_LOSS_RATE,
			isCustom: !!row,
			autoTune: row?.autoTune ?? true,
			tunedAt: row?.tunedAt ?? null,
			calibration: {
				resolved: results.length,
				bestRecordHitRate: bestRecordHitRate(results),
				blendedHitRate: blended,
				suggestedLossRate: suggestedTitleLossRate(blended),
				callerPicks: callers.picks,
				callerHitRate: callers.hitRate,
			},
		})
	}
	return rows
}

export async function titleLossSettingRow(
	leagueSlug: string,
	awardName: string,
): Promise<TitleLossSettingRow | undefined> {
	return (await titleLossSettingRows()).find(
		(row) => row.leagueSlug === leagueSlug && row.awardName === awardName,
	)
}

// The saved rate for one league title, or null to use the default.
export async function titleLossRateFor(
	leagueId: string,
	awardName: string,
): Promise<number | null> {
	const league = await db.query.leagues.findFirst({
		where: { id: leagueId },
		columns: { slug: true },
	})
	if (!league) return null
	const [row] = await db
		.select({ lossRate: titleLossSettings.lossRate })
		.from(titleLossSettings)
		.where(
			and(
				eq(titleLossSettings.leagueSlug, league.slug),
				eq(titleLossSettings.awardName, awardName),
			),
		)
	return row?.lossRate ?? null
}

// Back to the default rate, tuned automatically.
export async function resetTitleLossSetting(
	leagueSlug: string,
	awardName: string,
): Promise<void> {
	await db
		.delete(titleLossSettings)
		.where(
			and(
				eq(titleLossSettings.leagueSlug, leagueSlug),
				eq(titleLossSettings.awardName, awardName),
			),
		)
}

export async function saveTitleLossSetting(
	input: {
		leagueSlug: string
		awardName: string
		lossRate: number
		autoTune: boolean
	},
	updatedById: string,
): Promise<void> {
	const values = {
		lossRate: input.lossRate,
		autoTune: input.autoTune,
		updatedById,
		updatedAt: new Date(),
	}
	await db
		.insert(titleLossSettings)
		.values({
			leagueSlug: input.leagueSlug,
			awardName: input.awardName,
			...values,
		})
		.onConflictDoUpdate({
			target: [titleLossSettings.leagueSlug, titleLossSettings.awardName],
			set: values,
		})
}
