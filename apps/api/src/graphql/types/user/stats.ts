import { buildGlobalLeaderboard } from "../../../lib/global-leaderboard"
import {
	resolveSeasonIds,
	type SeasonFilter,
	seasonFilterKey,
} from "../../../lib/seasons"
import type { UserLeagueStatsData } from "../../../lib/user-stats"
import { builder } from "../../builder"
import { type Context, ctxCache } from "../../context"
import { LeagueRef } from "../sports"

// The site-wide ranking for one scope, built at most once per request. The
// leaderboard page's leaderboard and viewerLeaderboardEntry fields, and a
// profile's careerStats and per-league stats, all read rankings through
// here. The season filter is part of the key for the same reason leagueId
// is: two fields asking for different scopes must not share one ranking.
//
// Lives in user/ rather than beside the leaderboard fields because User
// needs it, and leaderboard.ts already imports UserRef from here.
export function getGlobalLeaderboard(
	ctx: Context,
	leagueId: string | null,
	season: SeasonFilter,
) {
	return ctxCache(
		ctx,
		`globalLeaderboard:${leagueId ?? ""}:${seasonFilterKey(season)}`,
		() =>
			resolveSeasonIds(season, leagueId).then((seasonIds) =>
				buildGlobalLeaderboard({ leagueId, seasonIds }),
			),
	)
}

export const UserLeagueStatsRef = builder
	.objectRef<UserLeagueStatsData>("UserLeagueStats")
	.implement({
		fields: (t) => ({
			league: t.field({ type: LeagueRef, resolve: (row) => row.league }),
			totalPoints: t.exposeInt("totalPoints"),
			rank: t.exposeInt("rank", { nullable: true }),
			accuracy: t.exposeFloat("accuracy", { nullable: true }),
			convictionEdge: t.exposeFloat("convictionEdge", { nullable: true }),
			callCount: t.exposeInt("callCount"),
			resolvedCallCount: t.exposeInt("resolvedCallCount"),
		}),
	})
