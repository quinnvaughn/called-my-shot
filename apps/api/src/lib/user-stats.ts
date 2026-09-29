import type { League } from "../db/schema"
import {
	buildGlobalLeaderboard,
	type LeaderboardEntry,
} from "./global-leaderboard"

export type UserLeagueStatsData = {
	league: League
	totalPoints: number
	rank: number | null
	accuracy: number | null
	convictionEdge: number | null
	callCount: number
	resolvedCallCount: number
}

// One entry per league this user has ever called a question in. Every number
// is buildGlobalLeaderboard scoped to that league and to no season - a
// profile shows a career in each league, not this season's standing in it
// (the leaderboard itself is where a season-scoped ranking lives). Where
// those points came from lives on User.record instead.
//
// leagueBoard supplies each league's all-time ranking, so a caller that
// already caches rankings per request can hand its cache in.
export async function buildUserLeagueStats(
	userId: string,
	leagues: League[],
	leagueBoard: (leagueId: string) => Promise<LeaderboardEntry[]> = (leagueId) =>
		buildGlobalLeaderboard({ leagueId }),
): Promise<UserLeagueStatsData[]> {
	const results: UserLeagueStatsData[] = []
	for (const league of leagues) {
		// buildGlobalLeaderboard only excludes users with zero calls in scope,
		// and every league passed here has at least one of this user's calls.
		const entry = (await leagueBoard(league.id)).find(
			(e) => e.user.id === userId,
		)
		if (!entry) continue
		results.push({
			league,
			totalPoints: entry.totalPoints,
			rank: entry.rank,
			accuracy: entry.accuracy,
			convictionEdge: entry.convictionEdge,
			callCount: entry.callCount,
			resolvedCallCount: entry.resolvedCallCount,
		})
	}
	return results
}
