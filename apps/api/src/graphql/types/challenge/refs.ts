import { db } from "../../../db"
import type { Challenge, ChallengeAcceptance } from "../../../db/schema"
import {
	challengeClosesAt,
	creatorTally,
	type Matchup,
	type Record3,
} from "../../../lib/challenges/outcome"
import { headToHead } from "../../../lib/challenges/record"
import { builder } from "../../builder"
import type { Context } from "../../context"
import { CallRef } from "../question/call"
import { userQuestionCallLoader } from "../question/loaders"
import { QuestionRef } from "../question/question-object"
import { UserRef } from "../user"
import { type ChallengeView, challengeViewLoader } from "./loaders"

export const ChallengeStateEnum = builder.enumType("ChallengeState", {
	values: {
		OPEN: { value: "open" },
		LIVE: { value: "live" },
		SETTLED: { value: "settled" },
		VOIDED: { value: "voided" },
	},
})

export const MatchupOutcomeEnum = builder.enumType("MatchupOutcome", {
	values: {
		CREATOR: { value: "creator" },
		ACCEPTOR: { value: "acceptor" },
		DRAW: { value: "draw" },
	},
})

export const ChallengeRecordRef = builder
	.objectRef<Record3>("ChallengeRecord")
	.implement({
		fields: (t) => ({
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			draws: t.exposeInt("draws"),
		}),
	})

type MatchupRow = {
	questionId: string
	creatorId: string
	acceptorId: string
	creatorPoints: number | null
	acceptorPoints: number | null
}

const loadUser = async (id: string) => {
	const user = await db.query.users.findFirst({ where: { id } })
	if (!user) throw new Error("Challenge user missing")
	return user
}

const loadQuestion = async (id: string) => {
	const question = await db.query.questions.findFirst({ where: { id } })
	if (!question) throw new Error("Challenge question missing")
	return question
}

const callOf = (ctx: Context, userId: string, questionId: string) =>
	userQuestionCallLoader(ctx).load(`${userId}:${questionId}`)

// One question of a 1v1: what each side called and what it's worth to them.
const ChallengeMatchupRowRef = builder
	.objectRef<MatchupRow>("ChallengeMatchupRow")
	.implement({
		fields: (t) => ({
			question: t.field({
				type: QuestionRef,
				resolve: (row) => loadQuestion(row.questionId),
			}),
			creatorCall: t.field({
				type: CallRef,
				nullable: true,
				resolve: (row, _args, ctx) =>
					callOf(ctx, row.creatorId, row.questionId),
			}),
			acceptorCall: t.field({
				type: CallRef,
				nullable: true,
				resolve: (row, _args, ctx) =>
					callOf(ctx, row.acceptorId, row.questionId),
			}),
			// Null until the question settles, and on a question never called.
			creatorPoints: t.int({
				nullable: true,
				resolve: (row) => row.creatorPoints,
			}),
			acceptorPoints: t.int({
				nullable: true,
				resolve: (row) => row.acceptorPoints,
			}),
		}),
	})

export type MatchupParent = {
	view: ChallengeView
	matchup: Matchup<ChallengeAcceptance>
}

export const ChallengeMatchupRef = builder
	.objectRef<MatchupParent>("ChallengeMatchup")
	.implement({
		fields: (t) => ({
			// The acceptance's id: one per person who took the creator on.
			id: t.id({ resolve: (p) => p.matchup.acceptance.id }),
			acceptor: t.field({
				type: UserRef,
				resolve: (p) => loadUser(p.matchup.acceptance.acceptorId),
			}),
			acceptedAt: t.field({
				type: "DateTime",
				resolve: (p) => p.matchup.acceptance.createdAt,
			}),
			// Totals so far. Final once the challenge settles.
			creatorPoints: t.int({ resolve: (p) => p.matchup.creator.total }),
			acceptorPoints: t.int({ resolve: (p) => p.matchup.acceptor.total }),
			outcome: t.field({
				type: MatchupOutcomeEnum,
				nullable: true,
				resolve: (p) => p.matchup.outcome,
			}),
			rows: t.field({
				type: [ChallengeMatchupRowRef],
				resolve: (p) =>
					p.view.questions.map((q) => ({
						questionId: q.id,
						creatorId: p.view.challenge.creatorId,
						acceptorId: p.matchup.acceptance.acceptorId,
						creatorPoints: p.matchup.creator.byQuestionId.get(q.id) ?? null,
						acceptorPoints: p.matchup.acceptor.byQuestionId.get(q.id) ?? null,
					})),
			}),
		}),
	})

type Entry = {
	questionId: string
	creatorId: string
	creatorPoints: number | null
}

// One question in a challenge with the creator's call on it, which anyone
// can see: it's the stance people are taking on. Null until they've called.
const ChallengeEntryRef = builder.objectRef<Entry>("ChallengeEntry").implement({
	fields: (t) => ({
		question: t.field({
			type: QuestionRef,
			resolve: (e) => loadQuestion(e.questionId),
		}),
		creatorCall: t.field({
			type: CallRef,
			nullable: true,
			resolve: (e, _args, ctx) => callOf(ctx, e.creatorId, e.questionId),
		}),
		// What the creator's call scored here once the question settles. Null
		// before then, and when they never called it.
		creatorPoints: t.int({
			nullable: true,
			resolve: (e) => e.creatorPoints,
		}),
	}),
})

const viewOf = (ctx: Context, challenge: Challenge) =>
	challengeViewLoader(ctx).load(challenge)

const MATCHUPS_MAX = 100

export const ChallengeRef = builder
	.objectRef<Challenge>("Challenge")
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			code: t.exposeString("code"),
			createdAt: t.field({ type: "DateTime", resolve: (c) => c.createdAt }),
			creator: t.field({
				type: UserRef,
				resolve: (c) => loadUser(c.creatorId),
			}),
			questions: t.field({
				type: [QuestionRef],
				resolve: async (c, _args, ctx) => {
					const view = await viewOf(ctx, c)
					const rows = await db.query.questions.findMany({
						where: { id: { in: view.questions.map((q) => q.id) } },
					})
					const byId = new Map(rows.map((q) => [q.id, q]))
					return view.questions.flatMap((q) => byId.get(q.id) ?? [])
				},
			}),
			// When it stops taking people: the first of its questions to lock.
			// Null once every question in it is voided.
			closesAt: t.field({
				type: "DateTime",
				nullable: true,
				resolve: async (c, _args, ctx) =>
					challengeClosesAt((await viewOf(ctx, c)).questions),
			}),
			state: t.field({
				type: ChallengeStateEnum,
				resolve: async (c, _args, ctx) => (await viewOf(ctx, c)).state,
			}),
			acceptanceCount: t.int({
				resolve: async (c, _args, ctx) =>
					(await viewOf(ctx, c)).matchups.length,
			}),
			// How the creator did against everyone who took them on. Only
			// settled 1v1s count, so it's all zeros until then.
			creatorTally: t.field({
				type: ChallengeRecordRef,
				resolve: async (c, _args, ctx) =>
					creatorTally((await viewOf(ctx, c)).matchups),
			}),
			// The questions in the creator's order, each with their call.
			entries: t.field({
				type: [ChallengeEntryRef],
				resolve: async (c, _args, ctx) => {
					const view = await viewOf(ctx, c)
					return view.questions.map((q) => ({
						questionId: q.id,
						creatorId: c.creatorId,
						creatorPoints: view.creatorPoints.byQuestionId.get(q.id) ?? null,
					}))
				},
			}),
			// One person's 1v1 against the creator, by username.
			matchup: t.field({
				type: ChallengeMatchupRef,
				nullable: true,
				args: { username: t.arg.string({ required: true }) },
				resolve: async (c, args, ctx) => {
					const user = await db.query.users.findFirst({
						where: { username: args.username },
						columns: { id: true },
					})
					if (!user) return null
					const view = await viewOf(ctx, c)
					const matchup = view.matchups.find(
						(m) => m.acceptance.acceptorId === user.id,
					)
					return matchup ? { view, matchup } : null
				},
			}),
			// Every 1v1, earliest first.
			matchups: t.field({
				type: [ChallengeMatchupRef],
				args: { first: t.arg.int({ required: false }) },
				resolve: async (c, args, ctx) => {
					const view = await viewOf(ctx, c)
					const first = Math.min(args.first ?? MATCHUPS_MAX, MATCHUPS_MAX)
					return view.matchups
						.slice(0, first)
						.map((matchup) => ({ view, matchup }))
				},
			}),
			// The viewer's own 1v1, when they've taken it on.
			viewerMatchup: t.field({
				type: ChallengeMatchupRef,
				nullable: true,
				resolve: async (c, _args, ctx) => {
					if (!ctx.user) return null
					const view = await viewOf(ctx, c)
					const matchup = view.matchups.find(
						(m) => m.acceptance.acceptorId === ctx.user?.id,
					)
					return matchup ? { view, matchup } : null
				},
			}),
			// Whether the viewer could still take it on. True signed out while
			// it's open, so the page offers it and asks them to sign up.
			viewerCanAccept: t.boolean({
				resolve: async (c, _args, ctx) => {
					const view = await viewOf(ctx, c)
					if (view.state !== "open") return false
					if (!ctx.user) return true
					if (c.creatorId === ctx.user.id) return false
					return !view.matchups.some(
						(m) => m.acceptance.acceptorId === ctx.user?.id,
					)
				},
			}),
			// The questions the viewer still has to call to take it on. Every
			// one of them signed out.
			viewerMissingQuestionIds: t.idList({
				resolve: async (c, _args, ctx) => {
					const view = await viewOf(ctx, c)
					const ids = view.questions
						.filter((q) => q.status !== "voided")
						.map((q) => q.id)
					const user = ctx.user
					if (!user) return ids
					const calls = await Promise.all(
						ids.map((id) => callOf(ctx, user.id, id)),
					)
					return ids.filter((_, i) => !calls[i])
				},
			}),
			// The viewer's record against the creator across every challenge
			// between them. Null signed out and on their own challenge.
			viewerHeadToHead: t.field({
				type: ChallengeRecordRef,
				nullable: true,
				resolve: (c, _args, ctx) =>
					ctx.user && ctx.user.id !== c.creatorId
						? headToHead(ctx.user.id, c.creatorId)
						: null,
			}),
		}),
	})
