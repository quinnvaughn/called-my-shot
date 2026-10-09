import { GROUP_BALLOTS_MAX, groupBallotSchema } from "@called-my-shot/schemas"
import { and, desc, eq } from "drizzle-orm"
import { db } from "../../../db"
import {
	type Ballot,
	ballots,
	type Group,
	groupBallots,
	groups,
	type User,
} from "../../../db/schema"
import { requireUser } from "../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import { memberBallotProgress } from "../../../lib/group-ballot"
import { assertGroupTracksLeague, requireGroupAdmin } from "../../../lib/groups"
import { builder } from "../../builder"
import type { Context } from "../../context"
import { parseInput } from "../../helpers"
import { BallotRef } from "../ballot"
import { UserRef } from "../user"
import { GroupPayload } from "./inputs"
import { memberUserIds, trackedLeagueIds } from "./leaderboard"
import { GroupRef } from "./refs"

type GroupBallotView = {
	ballot: Ballot
	addedBy: User | null
	memberStartedCount: number
	memberFinishedCount: number
}

const GroupBallotRef = builder
	.objectRef<GroupBallotView>("GroupBallot")
	.implement({
		fields: (t) => ({
			// The ballot's id: each is on a group's page at most once.
			id: t.id({ resolve: (view) => view.ballot.id }),
			ballot: t.field({ type: BallotRef, resolve: (view) => view.ballot }),
			addedBy: t.field({
				type: UserRef,
				nullable: true,
				resolve: (view) => view.addedBy,
			}),
			// How many of the group's current members have called at least one
			// member of the ballot.
			memberStartedCount: t.exposeInt("memberStartedCount"),
			// How many have called every member of it.
			memberFinishedCount: t.exposeInt("memberFinishedCount"),
		}),
	})

// The group's published ballots from the leagues it tracks now, newest
// first, so narrowing the leagues hides one without removing it.
async function loadGroupBallotViews(
	ctx: Context,
	group: Group,
): Promise<GroupBallotView[]> {
	const [rows, tracked, memberIds] = await Promise.all([
		db
			.select({ row: groupBallots, ballot: ballots })
			.from(groupBallots)
			.innerJoin(ballots, eq(ballots.id, groupBallots.ballotId))
			.where(
				and(
					eq(groupBallots.groupId, group.id),
					eq(ballots.status, "published"),
				),
			)
			.orderBy(desc(groupBallots.createdAt)),
		trackedLeagueIds(ctx, group.id),
		memberUserIds(ctx, group.id),
	])
	const visible = rows.filter(
		({ ballot }) => !tracked || tracked.includes(ballot.leagueId),
	)
	if (visible.length === 0) return []

	const adderIds = visible.flatMap(({ row }) =>
		row.addedBy ? [row.addedBy] : [],
	)
	const [progress, adders] = await Promise.all([
		memberBallotProgress(
			visible.map(({ ballot }) => ballot.id),
			memberIds,
		),
		adderIds.length > 0
			? db.query.users.findMany({ where: { id: { in: adderIds } } })
			: Promise.resolve([]),
	])
	return visible.map(({ row, ballot }) => {
		const counts = progress.get(ballot.id)
		return {
			ballot,
			addedBy: adders.find((u) => u.id === row.addedBy) ?? null,
			memberStartedCount: counts?.started ?? 0,
			memberFinishedCount: counts?.finished ?? 0,
		}
	})
}

builder.objectFields(GroupRef, (t) => ({
	// The ballots the group's admins have added to its page, newest first.
	ballots: t.field({
		type: [GroupBallotRef],
		resolve: (group, _args, ctx) => loadGroupBallotViews(ctx, group),
	}),
}))

// Adds a published ballot to the group's page. Any ballot in a league the
// group tracks qualifies, locked or not: the board is worth following
// through resolution. Adding one that's already there is a no-op.
export async function addBallotToGroup(
	ctx: Context,
	args: { groupId: string; ballotId: string },
) {
	const user = requireUser(ctx)
	const input = parseInput(groupBallotSchema, args)
	await requireGroupAdmin(input.groupId, user.id)

	const ballot = await db.query.ballots.findFirst({
		where: { id: input.ballotId },
	})
	if (ballot?.status !== "published") {
		throw new NotFoundError("Ballot not found")
	}

	const group = await db.transaction(async (tx) => {
		// Locks the group so two admins adding at once can't both pass the
		// limit check below.
		const [group] = await tx
			.select()
			.from(groups)
			.where(eq(groups.id, input.groupId))
			.for("update")
		if (!group) throw new NotFoundError("Group not found")
		await assertGroupTracksLeague(group, ballot)

		const existing = await tx
			.select({ ballotId: groupBallots.ballotId })
			.from(groupBallots)
			.innerJoin(ballots, eq(ballots.id, groupBallots.ballotId))
			.where(
				and(
					eq(groupBallots.groupId, group.id),
					eq(ballots.status, "published"),
				),
			)
		if (existing.some((row) => row.ballotId === ballot.id)) return group
		if (existing.length >= GROUP_BALLOTS_MAX) {
			throw ValidationError.field(
				null,
				`This group already has ${GROUP_BALLOTS_MAX} ballots. Remove one first.`,
			)
		}

		await tx
			.insert(groupBallots)
			.values({ groupId: group.id, ballotId: ballot.id, addedBy: user.id })
			// An unpublished ballot's leftover row (not counted above) is
			// replaced rather than left blocking the add.
			.onConflictDoUpdate({
				target: [groupBallots.groupId, groupBallots.ballotId],
				set: { addedBy: user.id, createdAt: new Date() },
			})
		return group
	})
	return { group }
}

export async function removeBallotFromGroup(
	ctx: Context,
	args: { groupId: string; ballotId: string },
) {
	const user = requireUser(ctx)
	const input = parseInput(groupBallotSchema, args)
	await requireGroupAdmin(input.groupId, user.id)

	await db
		.delete(groupBallots)
		.where(
			and(
				eq(groupBallots.groupId, input.groupId),
				eq(groupBallots.ballotId, input.ballotId),
			),
		)
	const group = await db.query.groups.findFirst({
		where: { id: input.groupId },
	})
	if (!group) throw new NotFoundError("Group not found")
	return { group }
}

builder.mutationFields((t) => ({
	addBallotToGroup: t.field({
		type: GroupPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "AddBallotToGroupResult" },
		},
		args: {
			groupId: t.arg.id({ required: true }),
			ballotId: t.arg.id({ required: true }),
		},
		resolve: (_root, args, ctx) => addBallotToGroup(ctx, args),
	}),

	removeBallotFromGroup: t.field({
		type: GroupPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "RemoveBallotFromGroupResult" },
		},
		args: {
			groupId: t.arg.id({ required: true }),
			ballotId: t.arg.id({ required: true }),
		},
		resolve: (_root, args, ctx) => removeBallotFromGroup(ctx, args),
	}),
}))
