import {
	BASE_POINTS_BY_SHAPE,
	defaultLossRate,
	LOSS_RATE_BY_SHAPE,
	TIER_MAX_MULT,
	targetHitRate,
} from "@called-my-shot/scoring"

// Every scoring number on the how-it-works page is read from
// @called-my-shot/scoring, so the copy can't drift from how points are
// actually scored.

// A share in the words the copy uses: "half", "a third".
export function fractionWords(share: number): string {
	if (share === 0.5) return "half"
	if (share === 0.25) return "a quarter"
	if (Math.abs(share - 1 / 3) < 1e-9) return "a third"
	return `${Math.round(share * 100)}%`
}

// What a miss costs at a loss rate.
export function missCost(lossRate: number): string {
	return lossRate === 1
		? "everything you committed"
		: `${fractionWords(lossRate)} of what you committed`
}

export const NUMERIC_LOSS = LOSS_RATE_BY_SHAPE.player_stat_numeric_guess
export const SEASON_LEADER_LOSS = LOSS_RATE_BY_SHAPE.player_season_stat_leader
export const SINGLE_AWARD_LOSS = LOSS_RATE_BY_SHAPE.player_season_award
export const MULTI_AWARD_LOSS = defaultLossRate("player_season_award", {
	picksRequired: 2,
})
export const TEAM_GUESS_TARGET = targetHitRate(
	LOSS_RATE_BY_SHAPE.team_stat_numeric_guess,
)

// The worked examples are a yes/no pick.
export const EXAMPLE_BASE = BASE_POINTS_BY_SHAPE.yes_no_prop
export const EXAMPLE_EARLY_MULT = 1.5
export const HIT_COMMITTED = Math.round(EXAMPLE_BASE * 0.6)
export const HIT_POINTS = Math.round(
	HIT_COMMITTED * TIER_MAX_MULT * EXAMPLE_EARLY_MULT,
)
export const MISS_COMMITTED = Math.round(EXAMPLE_BASE * 0.7)
export const MISS_POINTS = Math.round(
	MISS_COMMITTED * LOSS_RATE_BY_SHAPE.yes_no_prop,
)
