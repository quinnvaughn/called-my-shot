import { isRateToleranceTier } from "#/lib/field-signal"
import type { CreateQuestionValues } from "./form-context"
import type { CatalogStat } from "./use-question-catalog"

// player_season_stat_leader only - the one shape where total-vs-per-game is
// genuinely optional rather than required. It disambiguates a counting stat
// ("the most points this season" vs "the most points per game") and nothing
// else: a rate stat is already a rate, and a freeform customStat can't be
// classified either way. So it's offered only for a catalog counting stat,
// and when it isn't offered statAggregation stays undefined and the title
// states no aggregation at all.
export function offersStatAggregationFor(
	shape: CreateQuestionValues["shape"],
	stat: Pick<CatalogStat, "toleranceTier"> | undefined,
): boolean {
	return (
		shape === "player_season_stat_leader" &&
		!!stat &&
		!isRateToleranceTier(stat.toleranceTier)
	)
}
