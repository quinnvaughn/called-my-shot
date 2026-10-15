import { resolveStreakMode, type StreakMode } from "@called-my-shot/scoring"
import type { UserStreakPageQuery } from "#/graphql/generated/graphql"
import { formatCallDate } from "#/lib/format-date"

export type Streak = NonNullable<
	NonNullable<UserStreakPageQuery["userByUsername"]>["streak"]
>

// What the page, its meta and its og:image all lead with. The url's mode
// decides the side; within a side, the live run leads and the record one
// stands in once it has ended. Null when the track has nothing on either
// side, which is the page's not-found.
export function describeStreak(streak: Streak, requested: StreakMode | null) {
	const mode = resolveStreakMode(streak, requested)
	if (!mode) return null
	const run =
		mode === "cold"
			? streak.currentColdLength > 0
				? streak.coldRunCalls
				: streak.worstColdRunCalls
			: streak.currentLength > 0
				? streak.currentRunCalls
				: streak.bestRunCalls
	const first = run[0]
	const live =
		mode === "cold" ? streak.currentColdLength > 0 : streak.currentLength > 0
	return {
		mode,
		runPoints: run.reduce((sum, call) => sum + (call.totalPoints ?? 0), 0),
		runBonus:
			mode === "cold"
				? null
				: live
					? streak.currentRunBonus
					: streak.bestRunBonus,
		nextMilestone: mode === "hot" && live ? streak.nextMilestone : null,
		track: `${streak.league.abbreviation.toUpperCase()} ${streak.familyLabel}`,
		runStartedAt: first ? formatCallDate(first.createdAt) : null,
		lastCall: run[run.length - 1] ?? null,
	}
}
