import {
	GROUP_PINS_MAX,
	groupPinSchema,
	setGroupPinOrderSchema,
} from "@called-my-shot/schemas"
import { and, eq, inArray, max, notInArray } from "drizzle-orm"
import { db } from "../../../db"
import {
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
import { callablePins, memberCallCounts } from "../../../lib/group-pins"
import {
	assertGroupTracksLeague,
	requireGroupAdmin,
	shareQuestionInTx,
} from "../../../lib/groups"
import { builder } from "../../builder"
import { parseInput } from "../../helpers"
import { groupByKey } from "../../loader"
import { QuestionRef } from "../question"
import { UserRef } from "../user"
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
			// The question's id: a question is pinned at most once per group.
			id: t.id({ resolve: (view) => view.pin.questionId }),
			position: t.int({ resolve: (view) => view.pin.position }),
			question: t.field({
				type: QuestionRef,
				resolve: (view) => view.question,
			}),
			pinnedBy: t.field({
				type: UserRef,
				nullable: true,
				resolve: (view) => view.pinnedBy,
			}),
			// How many of the group's current members have called it.
			memberCallCount: t.int({ resolve: (view) => view.memberCallCount }),
		}),
	})

builder.objectFields(GroupRef, (t) => ({
	// The questions the group's admins recommend, in their order. Only ones
	// that can still be called, and only from leagues the group tracks now,
	// so narrowing the leagues hides a pin without deleting it.
	pinnedQuestions: t.field({
		type: [GroupPinRef],
		resolve: async (group, _args, ctx): Promise<GroupPinView[]> => {
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
			return visible.map((row) => ({
				pin: row.pin,
				question: row.question,
				pinnedBy: pinners.find((u) => u.id === row.pin.pinnedBy) ?? null,
				memberCallCount: counts.get(row.question.id) ?? 0,
			}))
		},
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
						`This group already has ${GROUP_PINS_MAX} pinned questions. Unpin one first.`,
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
			questionIds: t.arg.idList({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const input = parseInput(setGroupPinOrderSchema, args)
			await requireGroupAdmin(input.groupId, user.id)

			const group = await db.transaction(async (tx) => {
				const [group] = await tx
					.select()
					.from(groups)
					.where(eq(groups.id, input.groupId))
					.for("update")
				if (!group) throw new NotFoundError("Group not found")

				const current = (await callablePins(group.id, new Date(), tx)).map(
					(row) => row.question.id,
				)
				const given = new Set(input.questionIds)
				if (
					given.size !== input.questionIds.length ||
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
				await tx
					.delete(groupPins)
					.where(
						current.length > 0
							? and(
									eq(groupPins.groupId, group.id),
									notInArray(groupPins.questionId, current),
								)
							: eq(groupPins.groupId, group.id),
					)
				// Updated in place rather than reinserted, so who pinned each
				// one and when survive a reorder.
				for (const [position, questionId] of input.questionIds.entries()) {
					await tx
						.update(groupPins)
						.set({ position })
						.where(
							and(
								eq(groupPins.groupId, group.id),
								eq(groupPins.questionId, questionId),
							),
						)
				}
				return group
			})
			return { group }
		},
	}),
}))
