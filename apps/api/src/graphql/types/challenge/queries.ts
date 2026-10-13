import { and, desc, eq, gt, inArray, or } from "drizzle-orm"
import { db } from "../../../db"
import {
	calls,
	challengeAcceptances,
	challengeGroupPosts,
	challenges,
	questions,
} from "../../../db/schema"
import { challengeSettledAt } from "../../../lib/challenges/outcome"
import { headToHead } from "../../../lib/challenges/record"
import { normalizeInviteCode } from "../../../lib/invite-codes"
import { DAY_MS } from "../../../lib/time"
import { isUuid } from "../../../lib/uuid"
import { builder } from "../../builder"
import { GroupRef } from "../group/refs"
import { QuestionRef } from "../question/question-object"
import { UserRef } from "../user"
import { challengeViewLoader } from "./loaders"
import { ChallengeRecordRef, ChallengeRef } from "./refs"

export const ChallengeRoleEnum = builder.enumType("ChallengeRole", {
	values: {
		CREATED: { value: "created" },
		ACCEPTED: { value: "accepted" },
	},
})

const MY_CHALLENGES_MAX = 50
// How long a settled challenge stays on a group's Home.
const GROUP_SETTLED_DAYS = 7
const GROUP_CHALLENGES_MAX = 12

builder.queryFields((t) => ({
	// A challenge by the code in its link. Public: anyone with the link can
	// see it, signed in or not.
	challenge: t.field({
		type: ChallengeRef,
		nullable: true,
		args: { code: t.arg.string({ required: true }) },
		resolve: async (_root, args) => {
			const challenge = await db.query.challenges.findFirst({
				where: { code: normalizeInviteCode(args.code) },
			})
			return challenge ?? null
		},
	}),

	// The viewer's challenges, newest first: the ones they made, or the ones
	// they took on. Empty signed out.
	myChallenges: t.field({
		type: [ChallengeRef],
		args: { role: t.arg({ type: ChallengeRoleEnum, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = ctx.user
			if (!user) return []
			if (args.role === "created") {
				return db.query.challenges.findMany({
					where: { creatorId: user.id },
					orderBy: { createdAt: "desc" },
					limit: MY_CHALLENGES_MAX,
				})
			}
			const rows = await db
				.select({ challenge: challenges })
				.from(challengeAcceptances)
				.innerJoin(
					challenges,
					eq(challenges.id, challengeAcceptances.challengeId),
				)
				.where(eq(challengeAcceptances.acceptorId, user.id))
				.orderBy(desc(challengeAcceptances.createdAt))
				.limit(MY_CHALLENGES_MAX)
			return rows.map((r) => r.challenge)
		},
	}),

	// What the viewer can put in a new challenge: every open question they've
	// called, every open question on a given game, and a given question.
	// Soonest to lock first.
	challengeCandidates: t.field({
		type: [QuestionRef],
		args: {
			gameId: t.arg.id({ required: false }),
			questionId: t.arg.id({ required: false }),
		},
		resolve: async (_root, args, ctx) => {
			const user = ctx.user
			if (!user) return []
			const idArg = (value: unknown) =>
				value && isUuid(String(value)) ? String(value) : null
			const gameId = idArg(args.gameId)
			const questionId = idArg(args.questionId)
			const called = db
				.select({ id: calls.questionId })
				.from(calls)
				.where(eq(calls.userId, user.id))
			return db
				.select()
				.from(questions)
				.where(
					and(
						eq(questions.status, "open"),
						gt(questions.locksAt, new Date()),
						or(
							inArray(questions.id, called),
							gameId ? eq(questions.gameId, gameId) : undefined,
							questionId ? eq(questions.id, questionId) : undefined,
						),
					),
				)
				.orderBy(questions.locksAt)
				.limit(200)
		},
	}),
}))

builder.objectFields(GroupRef, (t) => ({
	// Challenges posted to the group that are still going, or settled in the
	// last GROUP_SETTLED_DAYS, newest post first.
	challengeHighlights: t.field({
		type: [ChallengeRef],
		resolve: async (group, _args, ctx) => {
			const rows = await db
				.select({ challenge: challenges })
				.from(challengeGroupPosts)
				.innerJoin(
					challenges,
					eq(challenges.id, challengeGroupPosts.challengeId),
				)
				.where(eq(challengeGroupPosts.groupId, group.id))
				.orderBy(desc(challengeGroupPosts.createdAt))
				.limit(GROUP_CHALLENGES_MAX * 3)
			const found = rows.map((r) => r.challenge)
			const views = await challengeViewLoader(ctx).loadMany(found)
			const since = Date.now() - GROUP_SETTLED_DAYS * DAY_MS
			return found
				.filter((_, i) => {
					const view = views[i]
					if (!view || view instanceof Error) return false
					if (view.state === "open" || view.state === "live") return true
					const settledAt = challengeSettledAt(view.questions)
					return settledAt !== null && settledAt.getTime() > since
				})
				.slice(0, GROUP_CHALLENGES_MAX)
		},
	}),
}))

builder.objectFields(UserRef, (t) => ({
	// The viewer's record against this user across every challenge between
	// them. Null signed out, on their own profile, and before any of them
	// has settled.
	headToHeadWithViewer: t.field({
		type: ChallengeRecordRef,
		nullable: true,
		resolve: async (user, _args, ctx) => {
			if (!ctx.user || ctx.user.id === user.id) return null
			const record = await headToHead(ctx.user.id, user.id)
			return record.wins + record.losses + record.draws > 0 ? record : null
		},
	}),
}))
