import { LOSS_RATE_BY_SHAPE } from "@called-my-shot/scoring"
import { db } from "../../db"
import { GAME_QUESTION_CATALOG } from "../../db/catalog/game-question-catalog"
import { parseGenerationKey } from "./generation-key"
import {
	boundedLossRate,
	countHits,
	type HitCount,
	pooledHitRate,
	stepRate,
} from "./pooling"

// A game stat leader question's loss rate is where a pick on the favorite
// breaks even: a favorite who leads a quarter of the time is worth a third of
// the stake on a miss (see breakEvenLossRate). It follows the favorite's real
// record, not callers', so it works with nobody calling. Each league stat's
// record leans on every other league stat's until its own is large, so a new
// league or stat starts from how favorites lead everywhere else.
export const LEADER_TUNING = {
	// The fewest resolved leader questions, across every league and stat,
	// before any rate moves.
	minSample: 30,
	// The most recent resolved leader questions each league stat's record is
	// read over, so a rate follows how a stat plays now rather than all-time.
	window: 100,
	// How many results every other league stat counts as while one league
	// stat's own record is small - see pooledHitRate.
	poolWeight: 20,
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

// A league stat's own record alone.
export function favoriteHitRate(results: boolean[]): number | null {
	if (results.length === 0) return null
	return results.filter(Boolean).length / results.length
}

// A league stat's record leaning on `pool` (every league stat's results,
// its own included) until its own is large.
export function blendedHitRate(
	results: boolean[],
	pool: HitCount,
): number | null {
	return pooledHitRate(countHits(results), pool, LEADER_TUNING.poolWeight)
}

export function suggestedLossRate(hitRate: number | null): number | null {
	return boundedLossRate(hitRate, LEADER_TUNING.minRate, LEADER_TUNING.maxRate)
}

// The rate to move to from `current`, or null to leave it: too few resolved
// questions anywhere to go on, or already where the record points.
export function nextLossRate(
	current: number,
	hitRate: number | null,
	poolTotal: number,
): number | null {
	if (poolTotal < LEADER_TUNING.minSample) return null
	return stepRate(current, suggestedLossRate(hitRate), LEADER_TUNING.maxStep)
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
