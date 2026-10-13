import { db } from "../../../db"
import type { Challenge } from "../../../db/schema"
import { requireUser } from "../../../lib/auth"
import { acceptChallenge } from "../../../lib/challenges/accept"
import { createChallenge } from "../../../lib/challenges/create"
import { postChallengeToGroups } from "../../../lib/challenges/groups"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
} from "../../../lib/errors"
import { normalizeInviteCode } from "../../../lib/invite-codes"
import { isUuid } from "../../../lib/uuid"
import { builder } from "../../builder"
import { CastCallSelectionInput } from "../question/inputs"
import { ChallengeRef } from "./refs"

const ChallengePayload = builder
	.objectRef<{ challenge: Challenge }>("ChallengePayload")
	.implement({
		fields: (t) => ({
			challenge: t.field({ type: ChallengeRef, resolve: (p) => p.challenge }),
		}),
	})

const CreateChallengeInput = builder.inputType("CreateChallengeInput", {
	fields: (t) => ({
		questionIds: t.idList({ required: true }),
		groupIds: t.idList({ required: false }),
	}),
})

// A call made while accepting. castCall's input without a fade.
const ChallengeCallInput = builder.inputType("ChallengeCallInput", {
	fields: (t) => ({
		questionId: t.id({ required: true }),
		caseText: t.string({ required: false }),
		guessValue: t.float({ required: false }),
		conviction: t.int({ required: false }),
		selections: t.field({ type: [CastCallSelectionInput], required: false }),
	}),
})

const AcceptChallengeInput = builder.inputType("AcceptChallengeInput", {
	fields: (t) => ({
		code: t.string({ required: true }),
		// One per question the viewer hasn't called yet, and no others.
		calls: t.field({ type: [ChallengeCallInput], required: false }),
	}),
})

const PostChallengeToGroupsInput = builder.inputType(
	"PostChallengeToGroupsInput",
	{
		fields: (t) => ({
			challengeId: t.id({ required: true }),
			groupIds: t.idList({ required: true }),
		}),
	},
)

const CHALLENGE_ERRORS = [
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
] as const

builder.mutationFields((t) => ({
	createChallenge: t.field({
		type: ChallengePayload,
		errors: {
			types: [...CHALLENGE_ERRORS],
			directResult: true,
			union: { name: "CreateChallengeResult" },
		},
		args: { input: t.arg({ type: CreateChallengeInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const challenge = await db.transaction((tx) =>
				createChallenge(tx, user, {
					questionIds: args.input.questionIds.map(String),
					groupIds: (args.input.groupIds ?? []).map(String),
				}),
			)
			return { challenge }
		},
	}),

	acceptChallenge: t.field({
		type: ChallengePayload,
		errors: {
			types: [...CHALLENGE_ERRORS],
			directResult: true,
			union: { name: "AcceptChallengeResult" },
		},
		args: { input: t.arg({ type: AcceptChallengeInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const { challenge } = await db.transaction((tx) =>
				acceptChallenge(
					tx,
					user,
					normalizeInviteCode(args.input.code),
					(args.input.calls ?? []).map((call) => ({
						...call,
						questionId: String(call.questionId),
						selections: call.selections?.map((s) => ({
							...s,
							optionId: String(s.optionId),
						})),
					})),
				),
			)
			return { challenge }
		},
	}),

	postChallengeToGroups: t.field({
		type: ChallengePayload,
		errors: {
			types: [...CHALLENGE_ERRORS],
			directResult: true,
			union: { name: "PostChallengeToGroupsResult" },
		},
		args: {
			input: t.arg({ type: PostChallengeToGroupsInput, required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const id = String(args.input.challengeId)
			const challenge = isUuid(id)
				? await db.query.challenges.findFirst({ where: { id } })
				: undefined
			if (!challenge) throw new NotFoundError("That challenge doesn't exist.")
			await db.transaction((tx) =>
				postChallengeToGroups(
					tx,
					user,
					challenge,
					args.input.groupIds.map(String),
				),
			)
			return { challenge }
		},
	}),
}))
