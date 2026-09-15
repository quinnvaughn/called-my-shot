import { and, eq } from "drizzle-orm"
import { db } from "../../db"
import { gameQuestionLossSettings } from "../../db/schema"
import {
	callerLeaderHits,
	DEFAULT_LEADER_LOSS_RATE,
	favoriteHitRate,
	favoriteResultsByTemplate,
	type LeaderTemplate,
	leaderTemplates,
	suggestedLossRate,
} from "./leader-calibration"

export type LeaderLossCalibration = {
	// Resolved leader questions with a favorite, within the tuning window.
	resolved: number
	// How often the favorite led those.
	favoriteHitRate: number | null
	// The rate a pick on the favorite breaks even at over the same questions.
	suggestedLossRate: number | null
	callerPicks: number
	callerHitRate: number | null
}

// One league stat as the admin Leaders page shows it: the loss rate its
// leader questions are created with now, the default, whether
// tuneLeaderLosses is moving it, and how the favorite has done.
export type LeaderLossSettingRow = LeaderTemplate & {
	lossRate: number
	defaultLossRate: number
	isCustom: boolean
	autoTune: boolean
	tunedAt: Date | null
	calibration: LeaderLossCalibration
}

async function leagueStatIds(template: LeaderTemplate) {
	const league = await db.query.leagues.findFirst({
		where: { slug: template.leagueSlug },
		columns: { id: true, sportId: true },
	})
	if (!league) return null
	const stat = await db.query.stats.findFirst({
		where: { sportId: league.sportId, name: template.statName },
		columns: { id: true },
	})
	return stat ? { leagueId: league.id, statId: stat.id } : null
}

// Every tuned league stat, in catalog order.
export async function leaderLossSettingRows(): Promise<LeaderLossSettingRow[]> {
	const [saved, resultsByTemplate] = await Promise.all([
		db.select().from(gameQuestionLossSettings),
		favoriteResultsByTemplate(),
	])
	const rows: LeaderLossSettingRow[] = []
	for (const template of leaderTemplates()) {
		const row = saved.find(
			(s) =>
				s.leagueSlug === template.leagueSlug &&
				s.statName === template.statName,
		)
		const results =
			resultsByTemplate.get(`${template.leagueSlug}:${template.templateId}`) ??
			[]
		const ids = await leagueStatIds(template)
		const callers = ids
			? await callerLeaderHits(ids.leagueId, ids.statId)
			: { picks: 0, hitRate: null }
		rows.push({
			...template,
			lossRate: row?.lossRate ?? DEFAULT_LEADER_LOSS_RATE,
			defaultLossRate: DEFAULT_LEADER_LOSS_RATE,
			isCustom: !!row,
			autoTune: row?.autoTune ?? true,
			tunedAt: row?.tunedAt ?? null,
			calibration: {
				resolved: results.length,
				favoriteHitRate: favoriteHitRate(results),
				suggestedLossRate: suggestedLossRate(results),
				callerPicks: callers.picks,
				callerHitRate: callers.hitRate,
			},
		})
	}
	return rows
}

export async function leaderLossSettingRow(
	leagueSlug: string,
	statName: string,
): Promise<LeaderLossSettingRow | undefined> {
	return (await leaderLossSettingRows()).find(
		(row) => row.leagueSlug === leagueSlug && row.statName === statName,
	)
}

// A league's saved leader loss rates by stat name.
export async function loadLeaderLossSettings(
	leagueSlug: string,
): Promise<Map<string, number>> {
	const rows = await db
		.select()
		.from(gameQuestionLossSettings)
		.where(eq(gameQuestionLossSettings.leagueSlug, leagueSlug))
	return new Map(rows.map((row) => [row.statName, row.lossRate]))
}

// The saved leader loss rate for one league stat, or null to use the default.
export async function leaderLossRateFor(
	leagueId: string,
	statName: string,
): Promise<number | null> {
	const league = await db.query.leagues.findFirst({
		where: { id: leagueId },
		columns: { slug: true },
	})
	if (!league) return null
	return (await loadLeaderLossSettings(league.slug)).get(statName) ?? null
}

// Back to the default rate, tuned automatically.
export async function resetLeaderLossSetting(
	leagueSlug: string,
	statName: string,
): Promise<void> {
	await db
		.delete(gameQuestionLossSettings)
		.where(
			and(
				eq(gameQuestionLossSettings.leagueSlug, leagueSlug),
				eq(gameQuestionLossSettings.statName, statName),
			),
		)
}

export async function saveLeaderLossSetting(
	input: {
		leagueSlug: string
		statName: string
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
		.insert(gameQuestionLossSettings)
		.values({
			leagueSlug: input.leagueSlug,
			statName: input.statName,
			...values,
		})
		.onConflictDoUpdate({
			target: [
				gameQuestionLossSettings.leagueSlug,
				gameQuestionLossSettings.statName,
			],
			set: values,
		})
}
