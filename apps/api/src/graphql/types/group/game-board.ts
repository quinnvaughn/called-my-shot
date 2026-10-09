import { db } from "../../../db"
import type { Game, Group, User } from "../../../db/schema"
import {
	type GroupGame,
	type GroupGameEntry,
	loadGroupGameEntries,
	loadGroupGames,
	loadViewerGroupsOnGame,
} from "../../../lib/group-game"
import { isUuid } from "../../../lib/uuid"
import { builder } from "../../builder"
import type { Context } from "../../context"
import { type CallPayout, CallPayoutRef, pendingPayout } from "../question/call"
import { GameRef } from "../sports"
import { UserRef } from "../user"
import { memberUserIds, trackedLeagueIds } from "./leaderboard"
import { GroupRef } from "./refs"

type BoardEntry = Omit<GroupGameEntry, "openCalls"> & {
	gameId: string
	user: User
	openCount: number
	openPayout: CallPayout | null
}

// One member's row on the group game board. Links to their full picks on the
// game; this is only the summary.
export const GroupGameEntryRef = builder
	.objectRef<BoardEntry>("GroupGameEntry")
	.implement({
		fields: (t) => ({
			user: t.field({ type: UserRef, resolve: (e) => e.user }),
			calledCount: t.exposeInt("calledCount"),
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			// Settled points only, the same sum as GameEntry.points.
			points: t.exposeInt("points"),
			// Calls still waiting on a result, unscored ones left out.
			openCount: t.exposeInt("openCount"),
			// What the open calls add up to if every one lands right, and if
			// every one misses. Null when nothing is open.
			openPayout: t.field({
				type: CallPayoutRef,
				nullable: true,
				resolve: (e) => e.openPayout,
			}),
		}),
	})

const GroupGameBoardRef = builder
	.objectRef<{ game: Game; entries: BoardEntry[] }>("GroupGameBoard")
	.implement({
		fields: (t) => ({
			game: t.field({ type: GameRef, resolve: (b) => b.game }),
			entries: t.field({
				type: [GroupGameEntryRef],
				resolve: (b) => b.entries,
			}),
		}),
	})

const GroupGameRef = builder.objectRef<GroupGame>("GroupGame").implement({
	fields: (t) => ({
		game: t.field({ type: GameRef, resolve: (g) => g.game }),
		// Members with at least one call on the game.
		callerCount: t.exposeInt("callerCount"),
	}),
})

const GameGroupBoardRef = builder
	.objectRef<{ group: Group; callerCount: number }>("GameGroupBoard")
	.implement({
		fields: (t) => ({
			group: t.field({ type: GroupRef, resolve: (b) => b.group }),
			callerCount: t.exposeInt("callerCount"),
		}),
	})

// Each open call's payout, summed. Win low and high stay apart because a
// numeric guess's win is a range until it settles.
async function sumOpenPayouts(
	ctx: Context,
	entry: GroupGameEntry,
): Promise<CallPayout | null> {
	const payouts = await Promise.all(
		entry.openCalls.map((call) => pendingPayout(ctx, call)),
	)
	const known = payouts.filter((p) => p !== null)
	if (known.length === 0) return null
	return known.reduce((sum, p) => ({
		winLow: sum.winLow + p.winLow,
		winHigh: sum.winHigh + p.winHigh,
		lose: sum.lose + p.lose,
	}))
}

builder.objectFields(GroupRef, (t) => ({
	// Every member's calls on one game, one row each, the viewer included.
	// Ranked by points so far, then by what's still live, so during a game
	// it reads as that game's leaderboard. Any game works, tracked league or
	// not. Null for an unknown game.
	gameBoard: t.field({
		type: GroupGameBoardRef,
		nullable: true,
		args: { gameId: t.arg.id({ required: true }) },
		resolve: async (group, args, ctx) => {
			if (!isUuid(args.gameId)) return null
			const [game, memberIds] = await Promise.all([
				db.query.games.findFirst({ where: { id: args.gameId } }),
				memberUserIds(ctx, group.id),
			])
			if (!game) return null

			const rawEntries = await loadGroupGameEntries(game.id, memberIds)
			const [users, payouts] = await Promise.all([
				rawEntries.length > 0
					? db.query.users.findMany({
							where: { id: { in: rawEntries.map((e) => e.userId) } },
						})
					: Promise.resolve([]),
				Promise.all(rawEntries.map((e) => sumOpenPayouts(ctx, e))),
			])
			const userById = new Map(users.map((u) => [u.id, u]))

			const entries = rawEntries.flatMap(
				({ openCalls, ...entry }, i): BoardEntry[] => {
					const user = userById.get(entry.userId)
					if (!user) return []
					return [
						{
							...entry,
							gameId: game.id,
							user,
							openCount: openCalls.length,
							openPayout: payouts[i] ?? null,
						},
					]
				},
			)
			entries.sort(
				(a, b) =>
					b.points - a.points ||
					(b.openPayout?.winHigh ?? 0) - (a.openPayout?.winHigh ?? 0) ||
					a.user.name.localeCompare(b.user.name),
			)
			return { game, entries }
		},
	}),
	// The group page's games strip: games in the group's leagues that a
	// member has called and that are on now, start within a day, or just
	// ended. See loadGroupGames for the window and order.
	liveGames: t.field({
		type: [GroupGameRef],
		resolve: async (group, _args, ctx) => {
			const [memberIds, tracked] = await Promise.all([
				memberUserIds(ctx, group.id),
				trackedLeagueIds(ctx, group.id),
			])
			return loadGroupGames(memberIds, tracked)
		},
	}),
}))

builder.objectFields(GameRef, (t) => ({
	// The viewer's groups with at least one member's call on this game, so
	// the game page can link to each group's board. Empty when signed out.
	viewerGroupBoards: t.field({
		type: [GameGroupBoardRef],
		resolve: async (game, _args, ctx) => {
			if (!ctx.user) return []
			const rows = await loadViewerGroupsOnGame(ctx.user.id, game.id)
			if (rows.length === 0) return []
			const groups = await db.query.groups.findMany({
				where: { id: { in: rows.map((r) => r.groupId) } },
			})
			const groupById = new Map(groups.map((g) => [g.id, g]))
			return rows.flatMap(({ groupId, callerCount }) => {
				const group = groupById.get(groupId)
				return group ? [{ group, callerCount }] : []
			})
		},
	}),
}))
