import { db } from "../../db"
import type { Call } from "../../db/schema"
import { requireUser } from "../../lib/auth"
import { canViewerSeePick } from "../../lib/call-visibility"
import { fieldPct } from "../../lib/calls"
import {
	clampPageSize,
	cursorWhere,
	decodeCursor,
	paginate,
} from "../../lib/pagination"
import { builder } from "../builder"
import { PageInfoRef } from "./pagination"

type Connection<T> = {
	items: T[]
	pageInfo: { hasNextPage: boolean; endCursor: string | null }
}

const QuestionType = builder.enumType("QuestionType", {
	values: {
		MULTIPLE_CHOICE: { value: "multiple_choice" },
		YES_NO: { value: "yes_no" },
		OVER_UNDER: { value: "over_under" },
		NUMERIC_GUESS: { value: "numeric_guess" },
		MULTI_SELECT: { value: "multi_select" },
	},
})

export const QuestionCategory = builder.enumType("QuestionCategory", {
	values: {
		SEASON_AWARDS: { value: "season_awards" },
		GAME_STATS: { value: "game_stats" },
		PLAYER_STATS: { value: "player_stats" },
		OTHER: { value: "other" },
	},
})

const QuestionStatus = builder.enumType("QuestionStatus", {
	values: {
		OPEN: { value: "open" },
		LOCKED: { value: "locked" },
		RESOLVED: { value: "resolved" },
		DISPUTED: { value: "disputed" },
	},
})

const DisputeStatus = builder.enumType("DisputeStatus", {
	values: {
		OPEN: { value: "open" },
		UPHELD: { value: "upheld" },
		OVERTURNED: { value: "overturned" },
	},
})

const NumericSubjectType = builder.enumType("NumericSubjectType", {
	values: {
		PLAYER: { value: "player" },
		TEAM: { value: "team" },
	},
})

// Not a DB column - derived from question.status (see myCalls below). A call
// is "resolved" once its question has resolved and scoring is final; open,
// locked, and disputed questions all still count as "open" from the caller's
// point of view since none of them are a final outcome yet.
const CallResolutionStatus = builder.enumType("CallResolutionStatus", {
	values: {
		OPEN: { value: "open" },
		RESOLVED: { value: "resolved" },
	},
})

export const QuestionOptionRef = builder.drizzleObject("questionOptions", {
	name: "QuestionOption",
	fields: (t) => ({
		id: t.exposeID("id"),
		label: t.exposeString("label"),
		sortOrder: t.exposeInt("sortOrder"),
		// set when this option actually is a real team or player (a championship
		// field, an All-NBA ballot) - null for freeform options like Yes/No
		team: t.relation("team", { nullable: true }),
		player: t.relation("player", { nullable: true }),
		// null until the question resolves
		isCorrect: t.exposeBoolean("isCorrect", { nullable: true }),
		callCount: t.relatedCount("selections"),
		// live % of the question's callers who picked this option - same formula
		// resolution scores against at lock (see fieldPct in lib/calls.ts), just
		// evaluated whenever this is queried instead of frozen at any one moment.
		fieldPct: t.field({
			type: "Float",
			nullable: true,
			resolve: async (option) => {
				const [selections, questionCalls] = await Promise.all([
					db.query.callSelections.findMany({
						where: { optionId: option.id },
						columns: { id: true },
					}),
					db.query.calls.findMany({
						where: { questionId: option.questionId },
						columns: { id: true },
					}),
				])
				if (questionCalls.length === 0) return null
				return fieldPct(selections.length, questionCalls.length)
			},
		}),
	}),
})

export const CallSelectionRef = builder.drizzleObject("callSelections", {
	name: "CallSelection",
	fields: (t) => ({
		id: t.exposeID("id"),
		conviction: t.exposeInt("conviction"),
		// null until the question resolves
		resultPoints: t.exposeInt("resultPoints", { nullable: true }),
		option: t.relation("option"),
	}),
})

export const CallRef = builder.drizzleObject("calls", {
	name: "Call",
	fields: (t) => ({
		id: t.exposeID("id"),
		// caseText/guessValue/conviction/hitTolerance/selections all reveal what
		// this call actually picked, so they're gated behind canViewerSeePick -
		// see lib/call-visibility.ts for the anti-copying rule. Identity
		// (user/question/createdAt) and totalPoints are not pick info and stay
		// visible regardless.
		caseText: t.field({
			type: "String",
			nullable: true,
			resolve: async (call, _args, ctx) =>
				(await canViewerSeePick(call, ctx.user?.id ?? null))
					? call.caseText
					: null,
		}),
		// numeric_guess only - everything else scores through selections
		guessValue: t.field({
			type: "Float",
			nullable: true,
			resolve: async (call, _args, ctx) =>
				(await canViewerSeePick(call, ctx.user?.id ?? null))
					? call.guessValue
					: null,
		}),
		conviction: t.field({
			type: "Int",
			nullable: true,
			resolve: async (call, _args, ctx) =>
				(await canViewerSeePick(call, ctx.user?.id ?? null))
					? call.conviction
					: null,
		}),
		hitTolerance: t.field({
			type: "Boolean",
			nullable: true,
			resolve: async (call, _args, ctx) =>
				(await canViewerSeePick(call, ctx.user?.id ?? null))
					? call.hitTolerance
					: null,
		}),
		createdAt: t.field({
			type: "String",
			resolve: (call) => call.createdAt.toISOString(),
		}),
		user: t.relation("user"),
		question: t.relation("question"),
		selections: t.field({
			type: [CallSelectionRef],
			resolve: async (call, _args, ctx) => {
				if (!(await canViewerSeePick(call, ctx.user?.id ?? null))) return []
				return db.query.callSelections.findMany({ where: { callId: call.id } })
			},
		}),
		// Drives whether the client should render this call's pick or a
		// "make your call to reveal" placeholder - same rule as the field
		// gating above, exposed directly so the client doesn't have to infer it
		// from null/empty values (which are also the legitimate "no pick yet"
		// shape for an unresolved call).
		viewerCanSeePick: t.field({
			type: "Boolean",
			resolve: (call, _args, ctx) =>
				canViewerSeePick(call, ctx.user?.id ?? null),
		}),
		// numeric_guess scores off its own resultPoints column above; every other
		// type sums across its selections. Null while any of those are pending.
		totalPoints: t.field({
			type: "Int",
			nullable: true,
			resolve: async (call) => {
				if (call.resultPoints !== null) return call.resultPoints
				const selections = await db.query.callSelections.findMany({
					where: { callId: call.id },
				})
				if (selections.length === 0) return null
				if (selections.some((s) => s.resultPoints === null)) return null
				return selections.reduce((sum, s) => sum + (s.resultPoints ?? 0), 0)
			},
		}),
	}),
})

export const CallConnectionRef = builder
	.objectRef<Connection<Call>>("CallConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [CallRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

const MyCallCountsRef = builder
	.objectRef<{ open: number; resolved: number }>("MyCallCounts")
	.implement({
		fields: (t) => ({
			open: t.exposeInt("open"),
			resolved: t.exposeInt("resolved"),
		}),
	})

export const ResolutionDisputeRef = builder.drizzleObject(
	"resolutionDisputes",
	{
		name: "ResolutionDispute",
		fields: (t) => ({
			id: t.exposeID("id"),
			reason: t.exposeString("reason"),
			status: t.field({ type: DisputeStatus, resolve: (d) => d.status }),
			// set by an admin once the dispute is decided
			resolutionNote: t.exposeString("resolutionNote", { nullable: true }),
			createdAt: t.field({
				type: "String",
				resolve: (d) => d.createdAt.toISOString(),
			}),
			resolvedAt: t.field({
				type: "String",
				nullable: true,
				resolve: (d) => d.resolvedAt?.toISOString() ?? null,
			}),
			user: t.relation("user"),
			question: t.relation("question"),
		}),
	},
)

export const QuestionRef = builder.drizzleObject("questions", {
	name: "Question",
	fields: (t) => ({
		id: t.exposeID("id"),
		type: t.field({ type: QuestionType, resolve: (q) => q.type }),
		category: t.field({ type: QuestionCategory, resolve: (q) => q.category }),
		title: t.exposeString("title"),
		isOfficial: t.exposeBoolean("isOfficial"),

		// manual resolution - a human states where they checked, in their own
		// words, rather than picking from a fixed source list
		resolutionSource: t.exposeString("resolutionSource"),
		resolutionSourceUrl: t.exposeString("resolutionSourceUrl", {
			nullable: true,
		}),

		locksAt: t.field({
			type: "String",
			resolve: (q) => q.locksAt.toISOString(),
		}),
		status: t.field({ type: QuestionStatus, resolve: (q) => q.status }),
		resolvedAt: t.field({
			type: "String",
			nullable: true,
			resolve: (q) => q.resolvedAt?.toISOString() ?? null,
		}),
		resolutionNote: t.exposeString("resolutionNote", { nullable: true }),

		// over_under and numeric_guess only - stat is the catalog-backed default,
		// customStat is the escape hatch used when stat is null
		stat: t.relation("stat", { nullable: true }),
		customStat: t.exposeString("customStat", { nullable: true }),

		// over_under only
		ouLine: t.exposeFloat("ouLine", { nullable: true }),

		// yes_no, over_under, and numeric_guess - optional subject, null for a
		// game-wide over/under (or a yes_no with no single team/player it's about)
		numericSubjectType: t.field({
			type: NumericSubjectType,
			nullable: true,
			resolve: (q) => q.numericSubjectType,
		}),
		subjectTeam: t.relation("subjectTeam", { nullable: true }),
		subjectPlayer: t.relation("subjectPlayer", { nullable: true }),

		// numeric_guess only
		numericTolerancePct: t.exposeFloat("numericTolerancePct", {
			nullable: true,
		}),
		numericActualValue: t.exposeFloat("numericActualValue", { nullable: true }),
		// live average of every guessValue submitted so far - numeric_guess only,
		// null until at least one call exists
		averageGuess: t.field({
			type: "Float",
			nullable: true,
			resolve: async (question) => {
				const calls = await db.query.calls.findMany({
					where: { questionId: question.id },
					columns: { guessValue: true },
				})
				const guesses = calls
					.map((call) => call.guessValue)
					.filter((value): value is number => value !== null)
				if (guesses.length === 0) return null
				return guesses.reduce((sum, value) => sum + value, 0) / guesses.length
			},
		}),

		// % of calls that landed within tolerance, once resolved - numeric_guess
		// only, null until at least one call has been scored. An aggregate like
		// averageGuess above, so it bypasses the per-call hitTolerance privacy
		// gate (see CallRef.hitTolerance) without attributing the result to any
		// one caller.
		numericHitRatePct: t.field({
			type: "Float",
			nullable: true,
			resolve: async (question) => {
				const calls = await db.query.calls.findMany({
					where: { questionId: question.id },
					columns: { hitTolerance: true },
				})
				const scored = calls.filter(
					(call): call is typeof call & { hitTolerance: boolean } =>
						call.hitTolerance !== null,
				)
				if (scored.length === 0) return null
				const hits = scored.filter((call) => call.hitTolerance).length
				return (hits / scored.length) * 100
			},
		}),

		// multi_select only
		picksRequired: t.exposeInt("picksRequired", { nullable: true }),

		createdAt: t.field({
			type: "String",
			resolve: (q) => q.createdAt.toISOString(),
		}),

		creator: t.relation("creator"),
		sport: t.relation("sport"),
		league: t.relation("league"),
		options: t.relation("options"),
		callCount: t.relatedCount("calls"),
		disputes: t.relation("disputes"),

		viewerCall: t.field({
			type: CallRef,
			nullable: true,
			resolve: (question, _args, ctx) => {
				if (!ctx.user) return null
				return db.query.calls.findFirst({
					where: { questionId: question.id, userId: ctx.user.id },
				})
			},
		}),

		viewerDispute: t.field({
			type: ResolutionDisputeRef,
			nullable: true,
			resolve: (question, _args, ctx) => {
				if (!ctx.user) return null
				return db.query.resolutionDisputes.findFirst({
					where: { questionId: question.id, userId: ctx.user.id },
				})
			},
		}),
	}),
})

builder.queryFields((t) => ({
	questions: t.field({
		type: [QuestionRef],
		resolve: () =>
			db.query.questions.findMany({ orderBy: { createdAt: "desc" } }),
	}),

	question: t.field({
		type: QuestionRef,
		nullable: true,
		args: { id: t.arg.id({ required: true }) },
		resolve: (_root, args) =>
			db.query.questions.findFirst({ where: { id: args.id } }),
	}),

	// The "My Calls" page - every call the viewer has made, split into an
	// Open tab (question still open/locked/disputed - no final outcome yet)
	// and a Resolved tab (question resolved, points are final). See
	// myCallCounts below for the counts shown on each tab.
	myCalls: t.field({
		type: CallConnectionRef,
		args: {
			status: t.arg({ type: CallResolutionStatus, required: true }),
			first: t.arg.int(),
			after: t.arg.string(),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const limit = clampPageSize(args.first)
			const cursor = args.after ? decodeCursor(args.after) : null
			const rows = await db.query.calls.findMany({
				where: {
					userId: user.id,
					question: {
						status:
							args.status === "resolved" ? "resolved" : { ne: "resolved" },
					},
					...(cursor ? cursorWhere(cursor) : {}),
				},
				orderBy: { createdAt: "desc", id: "desc" },
				limit: limit + 1,
			})
			return paginate(rows, limit)
		},
	}),

	myCallCounts: t.field({
		type: MyCallCountsRef,
		resolve: async (_root, _args, ctx) => {
			const user = requireUser(ctx)
			const calls = await db.query.calls.findMany({
				where: { userId: user.id },
				columns: { id: true },
				with: { question: { columns: { status: true } } },
			})
			const resolved = calls.filter(
				(call) => call.question?.status === "resolved",
			).length
			return { open: calls.length - resolved, resolved }
		},
	}),
}))
