import { leagueScope } from "../../../lib/group-leaderboard"
import { PLAYER_OF_THE_WEEK_MIN_CALLS } from "../../../lib/group-recap/compute"
import {
	buildWeekRace,
	loadOpenWeekCalls,
	type WeekRace,
	type WeekRaceEntry,
} from "../../../lib/group-recap/race"
import { weekContaining } from "../../../lib/group-recap/week"
import { builder } from "../../builder"
import { GameRef } from "../sports"
import { UserRef } from "../user"
import {
	getGroupWeekLeaderboard,
	memberUserIds,
	trackedLeagueIds,
} from "./leaderboard"
import { GroupRef } from "./refs"

const WeekRaceEntryRef = builder
	.objectRef<WeekRaceEntry>("GroupWeekRaceEntry")
	.implement({
		fields: (t) => ({
			rank: t.exposeInt("rank", { nullable: true }),
			totalPoints: t.exposeInt("totalPoints"),
			// Settled this week, which is what qualifying counts.
			settledCallCount: t.exposeInt("resolvedCallCount"),
			// Still to settle, on games that land in this week.
			openCallCount: t.exposeInt("openCallCount"),
			user: t.field({ type: UserRef, resolve: (e) => e.user }),
		}),
	})

const WeekRaceRef = builder.objectRef<WeekRace>("GroupWeekRace").implement({
	fields: (t) => ({
		// When the week closes and its Player of the Week is decided.
		endsAt: t.field({ type: "DateTime", resolve: (r) => r.week.end }),
		// Settled calls a member needs before they can win the week.
		qualifyingCalls: t.int({ resolve: () => PLAYER_OF_THE_WEEK_MIN_CALLS }),
		leaders: t.field({ type: [WeekRaceEntryRef], resolve: (r) => r.leaders }),
		// Null for a site admin viewing a group they aren't in.
		viewer: t.field({
			type: WeekRaceEntryRef,
			nullable: true,
			resolve: (r) => r.viewer,
		}),
		viewerNeighbor: t.field({
			type: WeekRaceEntryRef,
			nullable: true,
			resolve: (r) => r.viewerNeighbor,
		}),
		nextGame: t.field({
			type: GameRef,
			nullable: true,
			resolve: (r) => r.nextGame,
		}),
	}),
})

builder.objectFields(GroupRef, (t) => ({
	// The week in progress across every tracked league, ranked the way
	// Player of the Week is decided. Shares its board with the Leaderboard
	// tab's "This week" view.
	weekRace: t.field({
		type: WeekRaceRef,
		resolve: async (group, _args, ctx) => {
			const week = weekContaining(new Date())
			const [board, memberIds, tracked] = await Promise.all([
				getGroupWeekLeaderboard(ctx, group.id, null),
				memberUserIds(ctx, group.id),
				trackedLeagueIds(ctx, group.id),
			])
			const open = await loadOpenWeekCalls(
				memberIds,
				leagueScope(tracked, null),
				week,
			)
			return buildWeekRace(board, open, ctx.user?.id ?? null, week)
		},
	}),
}))
