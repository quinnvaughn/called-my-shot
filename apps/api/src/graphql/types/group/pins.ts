import {
	GROUP_PINS_MAX,
	groupPinSchema,
	setGroupPinOrderSchema,
} from "@called-my-shot/schemas"
import { and, eq, inArray, max, notInArray } from "drizzle-orm"
import { db } from "../../../db"
import {
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
	type CallablePin,
	callablePins,
	memberCallCounts,
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
import { addBallotToGroup, removeBallotFromGroup } from "./ballots"
import { GroupPayload } from "./inputs"
import { memberUserIds, trackedLeagueIds } from "./leaderboard"
import { GroupRef } from "./refs"

type GroupPinView = {
	pin: GroupPin
	question: Question
	pinnedBy: User | null
	memberCallCount: number
}

export const GroupPinRef = builder
	.objectRef<GroupPinView>("GroupPin")
	.implement({
		fields: (t) => ({
			// The pinned question's id: each is pinned at most once per group.
			id: t.id({ resolve: (view) => view.pin.questionId }),
			position: t.int({ resolve: (view) => view.pin.position }),
			question: t.field({
				type: QuestionRef,
				nullable: true,
				resolve: (view) => view.question,
			}),
			ballot: t.field({
				type: BallotRef,
				nullable: true,
				deprecationReason: "Ballots moved to Group.ballots.",
				resolve: () => null,
			}),
			pinnedBy: t.field({
				type: UserRef,
				nullable: true,
				resolve: (view) => view.pinnedBy,
			}),
			// How many of the group's current members have called the question.
			memberCallCount: t.int({ resolve: (view) => view.memberCallCount }),
			memberFinishedCount: t.int({
				nullable: true,
				deprecationReason: "Ballots moved to Group.ballots.",
				resolve: () => null,
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
		(row) => !tracked || tracked.includes(row.question.leagueId),
	)
	if (visible.length === 0) return []

	const pinnerIds = visible.flatMap((row) =>
		row.pin.pinnedBy ? [row.pin.pinnedBy] : [],
	)
	const [counts, pinners] = await Promise.all([
		memberCallCounts(
			visible.map((row) => row.question.id),
			memberIds,
		),
		pinnerIds.length > 0
			? db.query.users.findMany({ where: { id: { in: pinnerIds } } })
			: Promise.resolve([]),
	])
	return visible.map((row: CallablePin) => ({
		pin: row.pin,
		question: row.question,
		pinnedBy: pinners.find((u) => u.id === row.pin.pinnedBy) ?? null,
		memberCallCount: counts.get(row.question.id) ?? 0,
	}))
}

builder.objectFields(GroupRef, (t) => ({
	// The questions the group's admins recommend, in their order.
	pins: t.field({
		type: [GroupPinRef],
		resolve: (group, _args, ctx) => loadPinViews(ctx, group),
	}),
	pinnedQuestions: t.field({
		type: [GroupPinRef],
		deprecationReason: "Use pins.",
		resolve: (group, _args, ctx) => loadPinViews(ctx, group),
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
				if (pins.some((row) => row.question.id === question.id)) return group
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

	pinBallotToGroup: t.field({
		type: GroupPayload,
		deprecationReason: "Use addBallotToGroup.",
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "PinBallotToGroupResult" },
		},
		args: {
			groupId: t.arg.id({ required: true }),
			ballotId: t.arg.id({ required: true }),
		},
		resolve: (_root, args, ctx) => addBallotToGroup(ctx, args),
	}),

	unpinBallotFromGroup: t.field({
		type: GroupPayload,
		deprecationReason: "Use removeBallotFromGroup.",
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "UnpinBallotFromGroupResult" },
		},
		args: {
			groupId: t.arg.id({ required: true }),
			ballotId: t.arg.id({ required: true }),
		},
		resolve: (_root, args, ctx) => removeBallotFromGroup(ctx, args),
	}),

	// Reorders the group's callable pins. The list has to be exactly the
	// current set, so this can only rearrange pins, never add one around
	// pinQuestionToGroup's checks or drop one silently.
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
				deprecationReason: "Use pinIds.",
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
				const current = currentPins.map((row) => row.question.id)
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
					currentPins.map((row) => [row.question.id, row.pin.id]),
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
