import {
	GROUP_PINS_MAX,
	groupBallotPinSchema,
	groupPinSchema,
	setGroupPinOrderSchema,
} from "@called-my-shot/schemas"
import { and, eq, inArray, max, notInArray, sql } from "drizzle-orm"
import { db } from "../../../db"
import {
	type Ballot,
	type Group,
	type GroupPin,
	groupMembers,
	groupPins,
	groups,
	type Question,
	type User,
} from "../../../db/schema"
import { requireUser } from "../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import {
	ballotHasOpenMember,
	type CallablePin,
	callablePins,
	memberBallotProgress,
	memberCallCounts,
	pinTarget,
} from "../../../lib/group-pins"
import {
	assertGroupTracksLeague,
	requireGroupAdmin,
	shareQuestionInTx,
} from "../../../lib/groups"
import { builder } from "../../builder"
import type { Context } from "../../context"
import { parseInput } from "../../helpers"
import { groupByKey } from "../../loader"
import { BallotRef } from "../ballot"
import { QuestionRef } from "../question"
import { UserRef } from "../user"
import { GroupPayload } from "./inputs"
import { memberUserIds, trackedLeagueIds } from "./leaderboard"
import { GroupRef } from "./refs"

type GroupPinView = {
	pin: GroupPin
	question: Question | null
	ballot: Ballot | null
	pinnedBy: User | null
	memberCallCount: number
	memberFinishedCount: number | null
}

export const GroupPinRef = builder
	.objectRef<GroupPinView>("GroupPin")
	.implement({
		fields: (t) => ({
			// The pinned question's or ballot's id: each is pinned at most once
			// per group.
			id: t.id({
				resolve: (view) => view.pin.questionId ?? view.pin.ballotId ?? "",
			}),
			position: t.int({ resolve: (view) => view.pin.position }),
			// Exactly one of question and ballot is set.
			question: t.field({
				type: QuestionRef,
				nullable: true,
				resolve: (view) => view.question,
			}),
			ballot: t.field({
				type: BallotRef,
				nullable: true,
				resolve: (view) => view.ballot,
			}),
			pinnedBy: t.field({
				type: UserRef,
				nullable: true,
				resolve: (view) => view.pinnedBy,
			}),
			// How many of the group's current members have called the question,
			// or started the ballot.
			memberCallCount: t.int({ resolve: (view) => view.memberCallCount }),
			// How many have called every member of the ballot. Null on a
			// question pin.
			memberFinishedCount: t.int({
				nullable: true,
				resolve: (view) => view.memberFinishedCount,
			}),
		}),
	})

// The group's callable pins from the leagues it tracks now, so narrowing the
// leagues hides a pin without deleting it.
async function loadPinViews(
	ctx: Context,
	group: Group,
): Promise<GroupPinView[]> {
	const [rows, tracked, memberIds] = await Promise.all([
		callablePins(group.id, new Date()),
		trackedLeagueIds(ctx, group.id),
		memberUserIds(ctx, group.id),
	])
	const visible = rows.filter(
		(row) => !tracked || tracked.includes(pinTarget(row).leagueId),
	)
	if (visible.length === 0) return []

	const pinnerIds = visible.flatMap((row) =>
		row.pin.pinnedBy ? [row.pin.pinnedBy] : [],
	)
	const [counts, progress, pinners] = await Promise.all([
		memberCallCounts(
			visible.flatMap((row) => (row.question ? [row.question.id] : [])),
			memberIds,
		),
		memberBallotProgress(
			visible.flatMap((row) => (row.ballot ? [row.ballot.id] : [])),
			memberIds,
		),
		pinnerIds.length > 0
			? db.query.users.findMany({ where: { id: { in: pinnerIds } } })
			: Promise.resolve([]),
	])
	return visible.map((row: CallablePin) => {
		const ballotProgress = row.ballot ? progress.get(row.ballot.id) : null
		return {
			pin: row.pin,
			question: row.question,
			ballot: row.ballot,
			pinnedBy: pinners.find((u) => u.id === row.pin.pinnedBy) ?? null,
			memberCallCount: row.question
				? (counts.get(row.question.id) ?? 0)
				: (ballotProgress?.started ?? 0),
			memberFinishedCount: row.ballot ? (ballotProgress?.finished ?? 0) : null,
		}
	})
}

builder.objectFields(GroupRef, (t) => ({
	// The questions and ballots the group's admins recommend, in their order.
	pins: t.field({
		type: [GroupPinRef],
		resolve: (group, _args, ctx) => loadPinViews(ctx, group),
	}),
	pinnedQuestions: t.field({
		type: [GroupPinRef],
		deprecationReason: "Use pins, which includes pinned ballots.",
		resolve: async (group, _args, ctx) =>
			(await loadPinViews(ctx, group)).filter((view) => view.question),
	}),
}))

builder.objectField(QuestionRef, "viewerPinnedGroupIds", (t) =>
	// Which of the viewer's own groups have this question pinned - drives the
	// Pin/Unpin state per row in the share sheet. Scoped through
	// groupMembers for the same reason as viewerSharedGroupIds. Empty (not
	// null) when signed out.
	t.loadableList({
		type: "ID",
		load: async (questionIds: string[], ctx) => {
			if (!ctx.user) return questionIds.map(() => [])
			const rows = await db
				.select({
					questionId: groupPins.questionId,
					groupId: groupPins.groupId,
				})
				.from(groupPins)
				.innerJoin(
					groupMembers,
					and(
						eq(groupMembers.groupId, groupPins.groupId),
						eq(groupMembers.userId, ctx.user.id),
					),
				)
				.where(inArray(groupPins.questionId, questionIds))
			return groupByKey(questionIds, rows, (row) => row.questionId).map(
				(pins) => pins.map((pin) => pin.groupId),
			)
		},
		resolve: (question) => question.id,
	}),
)

builder.mutationFields((t) => ({
	// Appends a question to the group's pins and shares it to the group's
	// feed if it isn't there already. Pinning an already-pinned question is
	// a no-op.
	pinQuestionToGroup: t.field({
		type: GroupPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "PinQuestionToGroupResult" },
		},
		args: {
			groupId: t.arg.id({ required: true }),
			questionId: t.arg.id({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const input = parseInput(groupPinSchema, args)
			await requireGroupAdmin(input.groupId, user.id)

			const question = await db.query.questions.findFirst({
				where: { id: input.questionId },
			})
			if (!question) throw new NotFoundError("Question not found")
			const now = new Date()
			if (question.status !== "open" || question.locksAt <= now) {
				throw ValidationError.field(
					null,
					"This question has locked. Only open questions can be pinned.",
				)
			}

			const group = await db.transaction(async (tx) => {
				// Locks the group so two admins pinning at once can't both pass
				// the limit check below.
				const [group] = await tx
					.select()
					.from(groups)
					.where(eq(groups.id, input.groupId))
					.for("update")
				if (!group) throw new NotFoundError("Group not found")
				await assertGroupTracksLeague(group, question)

				const pins = await callablePins(group.id, now, tx)
				if (pins.some((row) => row.question?.id === question.id)) return group
				if (pins.length >= GROUP_PINS_MAX) {
					throw ValidationError.field(
						null,
						`This group already has ${GROUP_PINS_MAX} pins. Unpin one first.`,
					)
				}

				const [last] = await tx
					.select({ position: max(groupPins.position) })
					.from(groupPins)
					.where(eq(groupPins.groupId, group.id))
				await tx
					.insert(groupPins)
					.values({
						groupId: group.id,
						questionId: question.id,
						pinnedBy: user.id,
						position: (last?.position ?? -1) + 1,
					})
					// A stale row for the same question (locked, not yet swept)
					// can't be here: the question was just checked open.
					.onConflictDoNothing()
				await shareQuestionInTx(tx, { group, question, user })
				return group
			})
			return { group }
		},
	}),

	unpinQuestionFromGroup: t.field({
		type: GroupPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "UnpinQuestionFromGroupResult" },
		},
		args: {
			groupId: t.arg.id({ required: true }),
			questionId: t.arg.id({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const input = parseInput(groupPinSchema, args)
			await requireGroupAdmin(input.groupId, user.id)

			await db
				.delete(groupPins)
				.where(
					and(
						eq(groupPins.groupId, input.groupId),
						eq(groupPins.questionId, input.questionId),
					),
				)
			const group = await db.query.groups.findFirst({
				where: { id: input.groupId },
			})
			if (!group) throw new NotFoundError("Group not found")
			return { group }
		},
	}),

	// Appends a ballot to the group's pins while any of its members can still
	// be called. Pinning an already-pinned ballot is a no-op. Unlike a
	// question, nothing is shared to the group's feed: the feed holds
	// questions.
	pinBallotToGroup: t.field({
		type: GroupPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "PinBallotToGroupResult" },
		},
		args: {
			groupId: t.arg.id({ required: true }),
			ballotId: t.arg.id({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const input = parseInput(groupBallotPinSchema, args)
			await requireGroupAdmin(input.groupId, user.id)

			const ballot = await db.query.ballots.findFirst({
				where: { id: input.ballotId },
			})
			if (ballot?.status !== "published") {
				throw new NotFoundError("Ballot not found")
			}
			const now = new Date()
			const { rows } = await db.execute<{ open: boolean }>(
				sql`select ${ballotHasOpenMember(ballot.id, now)} as open`,
			)
			if (!rows[0]?.open) {
				throw ValidationError.field(
					null,
					"Everything on this ballot has locked. Only open ballots can be pinned.",
				)
			}

			const group = await db.transaction(async (tx) => {
				// Locks the group so two admins pinning at once can't both pass
				// the limit check below.
				const [group] = await tx
					.select()
					.from(groups)
					.where(eq(groups.id, input.groupId))
					.for("update")
				if (!group) throw new NotFoundError("Group not found")
				await assertGroupTracksLeague(group, ballot)

				const pins = await callablePins(group.id, now, tx)
				if (pins.some((row) => row.ballot?.id === ballot.id)) return group
				if (pins.length >= GROUP_PINS_MAX) {
					throw ValidationError.field(
						null,
						`This group already has ${GROUP_PINS_MAX} pins. Unpin one first.`,
					)
				}

				const [last] = await tx
					.select({ position: max(groupPins.position) })
					.from(groupPins)
					.where(eq(groupPins.groupId, group.id))
				await tx
					.insert(groupPins)
					.values({
						groupId: group.id,
						ballotId: ballot.id,
						pinnedBy: user.id,
						position: (last?.position ?? -1) + 1,
					})
					// A stale row for the same ballot (everything locked, not yet
					// swept) is replaced rather than left blocking the pin.
					.onConflictDoUpdate({
						target: [groupPins.groupId, groupPins.ballotId],
						set: {
							pinnedBy: user.id,
							position: (last?.position ?? -1) + 1,
							createdAt: now,
						},
					})
				return group
			})
			return { group }
		},
	}),

	unpinBallotFromGroup: t.field({
		type: GroupPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "UnpinBallotFromGroupResult" },
		},
		args: {
			groupId: t.arg.id({ required: true }),
			ballotId: t.arg.id({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const input = parseInput(groupBallotPinSchema, args)
			await requireGroupAdmin(input.groupId, user.id)

			await db
				.delete(groupPins)
				.where(
					and(
						eq(groupPins.groupId, input.groupId),
						eq(groupPins.ballotId, input.ballotId),
					),
				)
			const group = await db.query.groups.findFirst({
				where: { id: input.groupId },
			})
			if (!group) throw new NotFoundError("Group not found")
			return { group }
		},
	}),

	// Reorders the group's callable pins. The list has to be exactly the
	// current set, so this can only rearrange pins, never add one around
	// pinQuestionToGroup's or pinBallotToGroup's checks or drop one silently.
	setGroupPinOrder: t.field({
		type: GroupPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "SetGroupPinOrderResult" },
		},
		args: {
			groupId: t.arg.id({ required: true }),
			// Each pin's id (see GroupPin.id).
			pinIds: t.arg.idList({ required: false }),
			questionIds: t.arg.idList({
				required: false,
				deprecationReason: "Use pinIds, which can hold ballots too.",
			}),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const input = parseInput(setGroupPinOrderSchema, {
				groupId: args.groupId,
				pinIds: args.pinIds ?? args.questionIds ?? [],
			})
			await requireGroupAdmin(input.groupId, user.id)

			const group = await db.transaction(async (tx) => {
				const [group] = await tx
					.select()
					.from(groups)
					.where(eq(groups.id, input.groupId))
					.for("update")
				if (!group) throw new NotFoundError("Group not found")

				const currentPins = await callablePins(group.id, new Date(), tx)
				const current = currentPins.map((row) => pinTarget(row).id)
				const given = new Set(input.pinIds)
				if (
					given.size !== input.pinIds.length ||
					given.size !== current.length ||
					current.some((id) => !given.has(id))
				) {
					throw ValidationError.field(
						null,
						"The pinned questions changed. Refresh and try again.",
					)
				}

				// Locked pins the sweep hasn't reached yet would otherwise keep
				// positions among the reordered ones.
				const pinRowIds = currentPins.map((row) => row.pin.id)
				await tx
					.delete(groupPins)
					.where(
						pinRowIds.length > 0
							? and(
									eq(groupPins.groupId, group.id),
									notInArray(groupPins.id, pinRowIds),
								)
							: eq(groupPins.groupId, group.id),
					)
				// Updated in place rather than reinserted, so who pinned each
				// one and when survive a reorder.
				const rowIdByTarget = new Map(
					currentPins.map((row) => [pinTarget(row).id, row.pin.id]),
				)
				for (const [position, pinId] of input.pinIds.entries()) {
					const rowId = rowIdByTarget.get(pinId)
					if (!rowId) continue
					await tx
						.update(groupPins)
						.set({ position })
						.where(eq(groupPins.id, rowId))
				}
				return group
			})
			return { group }
		},
	}),
}))
