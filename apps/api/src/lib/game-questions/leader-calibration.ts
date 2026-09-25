import { LOSS_RATE_BY_SHAPE } from "@called-my-shot/scoring"
import { db } from "../../db"
import { GAME_QUESTION_CATALOG } from "../../db/catalog/game-question-catalog"
import { parseGenerationKey } from "./generation-key"
import { lossRateTuner, pushWithin } from "./pooling"

// A game stat leader question's loss rate is priced off a pick on the
// favorite: the rarer the favorite leads, the less a miss costs (see
// targetLossRate). It follows the favorite's real
// record, not callers', so it works with nobody calling. Each league stat's
// record leans on every other league stat's until its own is large, so a new
// league or stat starts from how favorites lead everywhere else.
export const LEADER_TUNING = {
	minSample: 30,
	// Recent enough that a rate follows how a stat plays now rather than
	// all-time.
	window: 100,
	poolWeight: 20,
	maxStep: 0.1,
	minRate: 0.05,
	maxRate: 1,
}

export const leaderRates = lossRateTuner(LEADER_TUNING)

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
		pushWithin(
			results,
			`${parsed.leagueSlug}:${parsed.templateId}`,
			question.options.some(
				(option) => option.playerId === favorite && option.isCorrect === true,
			),
			LEADER_TUNING.window,
		)
	}
	return results
}
