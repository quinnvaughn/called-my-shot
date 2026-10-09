import { db } from "../../../db"
import type { Ballot, Group, User } from "../../../db/schema"
import {
	type GroupBallotEntry,
	loadGroupBallotEntries,
	loadViewerGroupsOnBallot,
	sortGroupBallotEntries,
	type ViewerGroupBallotProgress,
} from "../../../lib/group-ballot"
import { isUuid } from "../../../lib/uuid"
import { builder } from "../../builder"
import { BallotRef } from "../ballot"
import { UserRef } from "../user"
import { memberUserIds } from "./leaderboard"
import { GroupRef } from "./refs"

type BoardEntry = GroupBallotEntry & { user: User }

// One member's row on the group ballot board. Links to their full entry;
// this is only the summary.
const GroupBallotEntryRef = builder
	.objectRef<BoardEntry>("GroupBallotEntry")
	.implement({
		fields: (t) => ({
			user: t.field({ type: UserRef, resolve: (e) => e.user }),
			calledCount: t.exposeInt("calledCount"),
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			// Settled points only, the same sum as BallotEntry.points.
			points: t.exposeInt("points"),
			// Null until every member of the ballot is called.
			completedAt: t.field({
				type: "DateTime",
				nullable: true,
				resolve: (e) => e.completedAt,
			}),
		}),
	})

const GroupBallotBoardRef = builder
	.objectRef<{ ballot: Ballot; entries: BoardEntry[]; notStarted: User[] }>(
		"GroupBallotBoard",
	)
	.implement({
		fields: (t) => ({
			ballot: t.field({ type: BallotRef, resolve: (b) => b.ballot }),
			// Members with at least one call on the ballot, the viewer
			// included. See sortGroupBallotEntries for the order.
			entries: t.field({
				type: [GroupBallotEntryRef],
				resolve: (b) => b.entries,
			}),
			// Members with no call on it yet, by name.
			notStarted: t.field({ type: [UserRef], resolve: (b) => b.notStarted }),
		}),
	})

type BallotGroupBoard = ViewerGroupBallotProgress & {
	group: Group
	viewerIsAdmin: boolean
	isPinned: boolean
}

const BallotGroupBoardRef = builder
	.objectRef<BallotGroupBoard>("BallotGroupBoard")
	.implement({
		fields: (t) => ({
			group: t.field({ type: GroupRef, resolve: (b) => b.group }),
			memberCount: t.exposeInt("memberCount"),
			// Members with at least one call on the ballot.
			startedCount: t.exposeInt("startedCount"),
			// Members who have called every member of it.
			finishedCount: t.exposeInt("finishedCount"),
			// Whether the viewer can pin or unpin it in this group.
			viewerIsAdmin: t.exposeBoolean("viewerIsAdmin"),
			isPinned: t.exposeBoolean("isPinned"),
		}),
	})

builder.objectFields(GroupRef, (t) => ({
	// Every member's progress on one published ballot. Any ballot works,
	// tracked league or not. Takes a slug or a uuid, like the ballot query.
	// Null for an unknown or unpublished ballot.
	ballotBoard: t.field({
		type: GroupBallotBoardRef,
		nullable: true,
		args: { ballotId: t.arg.id({ required: true }) },
		resolve: async (group, args, ctx) => {
			const [ballot, memberIds] = await Promise.all([
				db.query.ballots.findFirst({
					where: isUuid(args.ballotId)
						? { id: args.ballotId }
						: { slug: args.ballotId },
				}),
				memberUserIds(ctx, group.id),
			])
			if (ballot?.status !== "published") return null

			const [rawEntries, users] = await Promise.all([
				loadGroupBallotEntries(ballot.id, memberIds),
				memberIds.length > 0
					? db.query.users.findMany({ where: { id: { in: memberIds } } })
					: Promise.resolve([]),
			])
			const userById = new Map(users.map((u) => [u.id, u]))

			const entries = rawEntries.flatMap((entry): BoardEntry[] => {
				const user = userById.get(entry.userId)
				return user ? [{ ...entry, user }] : []
			})
			const started = new Set(entries.map((e) => e.user.id))
			const notStarted = users
				.filter((u) => !started.has(u.id))
				.sort((a, b) => a.name.localeCompare(b.name))

			return {
				ballot,
				entries: sortGroupBallotEntries(entries),
				notStarted,
			}
		},
	}),
}))

builder.objectFields(BallotRef, (t) => ({
	// The viewer's groups that follow this ballot's league, with each one's
	// progress on it, so the ballot page can link to each group's board.
	// Empty when signed out.
	viewerGroupBoards: t.field({
		type: [BallotGroupBoardRef],
		resolve: async (ballot, _args, ctx) => {
			if (!ctx.user) return []
			const rows = await loadViewerGroupsOnBallot(ctx.user.id, ballot)
			if (rows.length === 0) return []
			const groupIds = rows.map((r) => r.groupId)
			const [groups, adminRows, pinRows] = await Promise.all([
				db.query.groups.findMany({ where: { id: { in: groupIds } } }),
				db.query.groupMembers.findMany({
					where: {
						userId: ctx.user.id,
						groupId: { in: groupIds },
						role: "admin",
					},
					columns: { groupId: true },
				}),
				db.query.groupPins.findMany({
					where: { ballotId: ballot.id, groupId: { in: groupIds } },
					columns: { groupId: true },
				}),
			])
			const groupById = new Map(groups.map((g) => [g.id, g]))
			const adminOf = new Set(adminRows.map((r) => r.groupId))
			const pinnedIn = new Set(pinRows.map((r) => r.groupId))
			return rows.flatMap((row): BallotGroupBoard[] => {
				const group = groupById.get(row.groupId)
				return group
					? [
							{
								...row,
								group,
								viewerIsAdmin: adminOf.has(row.groupId),
								isPinned: pinnedIn.has(row.groupId),
							},
						]
					: []
			})
		},
	}),
}))
