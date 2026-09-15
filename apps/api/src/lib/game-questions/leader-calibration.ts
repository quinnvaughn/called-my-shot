import { breakEvenLossRate, LOSS_RATE_BY_SHAPE } from "@called-my-shot/scoring"
import { db } from "../../db"
import { GAME_QUESTION_CATALOG } from "../../db/catalog/game-question-catalog"
import { parseGenerationKey } from "./generation-key"

// A game stat leader question's loss rate is where a pick on the favorite
// breaks even: a favorite who leads a quarter of the time is worth a third of
// the stake on a miss (see breakEvenLossRate). It follows the favorite's real
// record, not callers', so it works with nobody calling.
export const LEADER_TUNING = {
	// The fewest resolved leader questions a rate is tuned from.
	minSample: 30,
	// The most recent resolved leader questions the favorite's record is read
	// over, so a rate follows how a stat plays now rather than all-time.
	window: 100,
	// The most a rate moves in one run.
	maxStep: 0.1,
	minRate: 0.05,
	maxRate: 1,
}

export const DEFAULT_LEADER_LOSS_RATE =
	LOSS_RATE_BY_SHAPE.player_game_stat_leader

// The league stats a loss rate is tuned for: every game stat leader question
// the generator posts.
export type LeaderTemplate = {
	leagueSlug: string
	templateId: string
	statName: string
}

export function leaderTemplates(): LeaderTemplate[] {
	return Object.entries(GAME_QUESTION_CATALOG).flatMap(
		([leagueSlug, templates]) =>
			templates.flatMap((template) =>
				template.shape === "player_game_stat_leader"
					? [
							{
								leagueSlug,
								templateId: template.id,
								statName: template.statName,
							},
						]
					: [],
			),
	)
}

export function leaderTemplate(
	leagueSlug: string,
	statName: string,
): LeaderTemplate | undefined {
	return leaderTemplates().find(
		(template) =>
			template.leagueSlug === leagueSlug && template.statName === statName,
	)
}

// Whether each resolved generated leader question's favorite led the game
// (a share of a tie counts), most recent first, by "<league>:<template>". A
// question posted without a favorite doesn't count.
export async function favoriteResultsByTemplate(): Promise<
	Map<string, boolean[]>
> {
	const resolved = await db.query.questions.findMany({
		where: {
			shape: "player_game_stat_leader",
			status: "resolved",
			generationKey: { isNotNull: true },
			leaderBasis: { isNotNull: true },
		},
		columns: { generationKey: true, leaderBasis: true },
		with: { options: { columns: { playerId: true, isCorrect: true } } },
		orderBy: { locksAt: "desc" },
	})

	const results = new Map<string, boolean[]>()
	for (const question of resolved) {
		const parsed = question.generationKey
			? parseGenerationKey(question.generationKey)
			: null
		const favorite = question.leaderBasis?.favoritePlayerId
		if (!parsed || !favorite) continue
		const key = `${parsed.leagueSlug}:${parsed.templateId}`
		const list = results.get(key) ?? []
		if (list.length < LEADER_TUNING.window) {
			list.push(
				question.options.some(
					(option) => option.playerId === favorite && option.isCorrect === true,
				),
			)
		}
		results.set(key, list)
	}
	return results
}

export function favoriteHitRate(results: boolean[]): number | null {
	if (results.length === 0) return null
	return results.filter(Boolean).length / results.length
}

const roundRate = (value: number) => Math.round(value * 100) / 100

// The loss rate a pick on the favorite breaks even at, within bounds.
export function suggestedLossRate(results: boolean[]): number | null {
	const hitRate = favoriteHitRate(results)
	if (hitRate === null) return null
	return roundRate(
		Math.min(
			LEADER_TUNING.maxRate,
			Math.max(LEADER_TUNING.minRate, breakEvenLossRate(hitRate)),
		),
	)
}

// The rate to move to from `current`, or null to leave it: too few resolved
// questions to go on, or already where they point.
export function nextLossRate(
	current: number,
	results: boolean[],
): number | null {
	if (results.length < LEADER_TUNING.minSample) return null
	const target = suggestedLossRate(results)
	if (target === null) return null
	const rate = roundRate(
		Math.min(
			current + LEADER_TUNING.maxStep,
			Math.max(current - LEADER_TUNING.maxStep, target),
		),
	)
	return rate === current ? null : rate
}

// Real scored picks on resolved leader questions for one league stat. For
// comparison only: with a handful of callers this says little, and it mixes
// in how good the callers are.
export async function callerLeaderHits(
	leagueId: string,
	statId: string,
): Promise<{ picks: number; hitRate: number | null }> {
	const rows = await db.query.callSelections.findMany({
		where: {
			resultPoints: { isNotNull: true },
			call: {
				question: {
					leagueId,
					statId,
					shape: "player_game_stat_leader",
					status: "resolved",
				},
			},
		},
		columns: { id: true },
		with: { option: { columns: { isCorrect: true } } },
	})
	const hits = rows.filter((row) => row.option?.isCorrect === true).length
	return {
		picks: rows.length,
		hitRate: rows.length === 0 ? null : hits / rows.length,
	}
}
