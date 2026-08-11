import { db } from "../../db"
import { builder } from "../builder"

const QuestionType = builder.enumType("QuestionType", {
	values: {
		MULTIPLE_CHOICE: { value: "multiple_choice" },
		YES_NO: { value: "yes_no" },
		OVER_UNDER: { value: "over_under" },
		NUMERIC_GUESS: { value: "numeric_guess" },
		MULTI_SELECT: { value: "multi_select" },
	},
})

const QuestionCategory = builder.enumType("QuestionCategory", {
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
		// live % of the question's callers who picked this option - not the
		// fieldPctAtCall snapshot a caller's own selection locked in at call time
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
				return (selections.length / questionCalls.length) * 100
			},
		}),
	}),
})

export const CallSelectionRef = builder.drizzleObject("callSelections", {
	name: "CallSelection",
	fields: (t) => ({
		id: t.exposeID("id"),
		conviction: t.exposeInt("conviction"),
		fieldPctAtCall: t.exposeFloat("fieldPctAtCall"),
		// null until the question resolves
		resultPoints: t.exposeInt("resultPoints", { nullable: true }),
		option: t.relation("option"),
	}),
})

export const CallRef = builder.drizzleObject("calls", {
	name: "Call",
	fields: (t) => ({
		id: t.exposeID("id"),
		caseText: t.exposeString("caseText", { nullable: true }),
		// numeric_guess only - everything else scores through selections
		guessValue: t.exposeFloat("guessValue", { nullable: true }),
		conviction: t.exposeInt("conviction", { nullable: true }),
		hitTolerance: t.exposeBoolean("hitTolerance", { nullable: true }),
		createdAt: t.field({
			type: "String",
			resolve: (call) => call.createdAt.toISOString(),
		}),
		user: t.relation("user"),
		question: t.relation("question"),
		selections: t.relation("selections"),
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

		// over_under and numeric_guess only - optional subject, null for a
		// game-wide over/under with no single team or player it's about
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

	myCalls: t.field({
		type: [CallRef],
		resolve: async (_root, _args, ctx) => {
			if (!ctx.user) return []
			return db.query.calls.findMany({
				where: { userId: ctx.user.id },
				orderBy: { createdAt: "desc" },
			})
		},
	}),
}))
