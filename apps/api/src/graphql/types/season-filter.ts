import { ALL_TIME, type SeasonFilter } from "../../lib/seasons"
import { builder } from "../builder"

// Seasons belong to leagues, not to the app - seasons.year is ESPN's own
// label and means different things per league (see db/schema/sports.ts), so
// there's no cross-league season id to name and no way to express "this
// season" as a single one. Hence a scope rather than a plain seasonId arg:
// CURRENT resolves per league at request time (every league's own current
// season when no league is in scope), SPECIFIC names one outright.
//
// Its own module rather than living in leaderboard.ts because both
// leaderboard.ts and group.ts need it, and group.ts importing from
// leaderboard.ts would run back into leaderboard.ts -> user.ts. Same
// reasoning as lib/global-leaderboard.ts being a plain shared module.
export const SeasonScopeEnum = builder.enumType("SeasonScope", {
	values: ["CURRENT", "ALL_TIME", "SPECIFIC"] as const,
})

export const SeasonFilterInput = builder.inputType("SeasonFilterInput", {
	fields: (t) => ({
		scope: t.field({ type: SeasonScopeEnum, required: true }),
		seasonId: t.id({
			required: false,
			description: "Required when scope is SPECIFIC; ignored otherwise.",
		}),
	}),
})

// Defaults to all-time rather than the current season so a caller that omits
// the arg keeps the numbers it had before this existed. The surfaces that
// want a season-scoped board ask for one explicitly.
export function toSeasonFilter(
	arg:
		| { scope: "CURRENT" | "ALL_TIME" | "SPECIFIC"; seasonId?: string | null }
		| null
		| undefined,
): SeasonFilter {
	return arg ? { scope: arg.scope, seasonId: arg.seasonId } : ALL_TIME
}
