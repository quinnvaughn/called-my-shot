import { STREAK_FAMILY_LABEL } from "@called-my-shot/scoring"
import {
	buildGroupHighlights,
	type GroupHighlights,
	type GroupStreakEntry,
	type GroupSweepEntry,
} from "../../../lib/group-highlights"
import { formatSlateLabel, parseSlateKey } from "../../../lib/streaks/slate"
import { builder } from "../../builder"
import { type Context, ctxCache } from "../../context"
import { LeagueRef } from "../sports"
import { StreakFamilyEnum, UserRef } from "../user"
import { memberUserIds, trackedLeagueIds } from "./leaderboard"

// Named streak/sweep types of their own rather than a `user` field added to
// UserStreak/UserSweep: same reasoning as GroupLeaderboardEntry, and it keeps
// the group lists from having to hand a partially loaded relation to a
// drizzleObject (see the note atop lib/streaks/read.ts).
export const GroupStreakEntryRef = builder
	.objectRef<GroupStreakEntry>("GroupStreakEntry")
	.implement({
		fields: (t) => ({
			user: t.field({ type: UserRef, resolve: (e) => e.user }),
			league: t.field({ type: LeagueRef, resolve: (e) => e.league }),
			family: t.field({
				type: StreakFamilyEnum,
				resolve: (e) => e.streak.family,
			}),
			familyLabel: t.field({
				type: "String",
				resolve: (e) => STREAK_FAMILY_LABEL[e.streak.family],
			}),
			currentLength: t.int({ resolve: (e) => e.streak.currentLength }),
			bestLength: t.int({ resolve: (e) => e.streak.bestLength }),
			currentColdLength: t.int({ resolve: (e) => e.streak.currentColdLength }),
			worstColdLength: t.int({ resolve: (e) => e.streak.worstColdLength }),
		}),
	})

export const GroupSweepEntryRef = builder
	.objectRef<GroupSweepEntry>("GroupSweepEntry")
	.implement({
		fields: (t) => ({
			user: t.field({ type: UserRef, resolve: (e) => e.user }),
			league: t.field({ type: LeagueRef, resolve: (e) => e.league }),
			slateKey: t.string({ resolve: (e) => e.sweep.slateKey }),
			// "Week 3 Sunday Early", "Sep 14" - reads after the league's
			// abbreviation, same as UserSweep.slateLabel.
			slateLabel: t.field({
				type: "String",
				resolve: (e) => {
					const slate = parseSlateKey(e.sweep.slateKey)
					return slate
						? formatSlateLabel(slate, e.league.slug)
						: e.sweep.slateKey
				},
			}),
			gameCount: t.int({ resolve: (e) => e.sweep.gameCount }),
			firstStartsAt: t.field({
				type: "DateTime",
				resolve: (e) => e.sweep.firstStartsAt,
			}),
			settledAt: t.field({
				type: "DateTime",
				resolve: (e) => e.sweep.settledAt,
			}),
		}),
	})

// Built at most once per group per request: hotStreaks/coldStreaks/
// streakRecords/recentSweeps on Group all come off one page load. No league or
// season in the key because nothing narrows this (see buildGroupHighlights).
export function getGroupHighlights(
	ctx: Context,
	groupId: string,
): Promise<GroupHighlights> {
	return ctxCache(ctx, `groupHighlights:${groupId}`, async () => {
		const [memberIds, tracked] = await Promise.all([
			memberUserIds(ctx, groupId),
			trackedLeagueIds(ctx, groupId),
		])
		return buildGroupHighlights(memberIds, tracked)
	})
}
