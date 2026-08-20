import {
	adminResolveQuestionSchema,
	castCallSchema,
	createQuestionSchema,
	fileDisputeSchema,
	type questionCategorySchema,
	resolveQuestionSchema,
	voidQuestionSchema,
} from "@called-my-shot/schemas"
import {
	BASE_POINTS_BY_TYPE,
	earlyTierFor,
	fieldPct,
	numericGuessPoints,
	selectionPoints,
} from "@called-my-shot/scoring"
import {
	and,
	asc,
	count,
	desc,
	eq,
	exists,
	getColumns,
	ilike,
	inArray,
	isNotNull,
	lte,
	notInArray,
	or,
	sql,
} from "drizzle-orm"
import { DateTime } from "luxon"
import { db } from "../../db"
import {
	type Call,
	callSelections,
	calls,
	leagues,
	players,
	type Question,
	questionOptions,
	questions,
	questionVoids,
	resolutionDisputes,
	teams,
	users,
} from "../../db/schema"
import {
	buildAdminConnection,
	clampAdminPageSize,
	SortDirection,
	sortColumn,
} from "../../lib/admin-pagination"
import { requireAdmin, requireUser } from "../../lib/auth"
import { canViewerSeePick } from "../../lib/call-visibility"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../lib/errors"
import { typicalGameLengthHours } from "../../lib/game-length"
import {
	clampPageSize,
	cursorWhere,
	decodeCursor,
	decodeOffsetCursor,
	encodeOffsetCursor,
	paginate,
} from "../../lib/pagination"
import { accuracyFrom, scoreCalls } from "../../lib/scoring"
import { STRIKE_LOCK_THRESHOLD } from "../../lib/strikes"
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

// Drives ordering for the questions feed. HOT ranks by live call count (see
// call_counts CTE in the questions resolver below) - not a stored column, so
// its pagination uses an offset cursor rather than the (createdAt, id)
// keyset NEW/CLOSING_SOON can use.
const QuestionSortOrder = builder.enumType("QuestionSortOrder", {
	values: {
		HOT: { value: "hot" },
		NEW: { value: "new" },
		CLOSING_SOON: { value: "closing_soon" },
	},
})

// Admin Questions table's column sort - a distinct axis from the feed
// ordering above (which ranks by "what should a viewer see first", not by a
// literal column), so it gets its own enum rather than extending that one.
const AdminQuestionSort = builder.enumType("AdminQuestionSort", {
	values: {
		TITLE: { value: "title" },
		TYPE: { value: "type" },
		ASKER: { value: "asker" },
		CALLERS: { value: "callers" },
		STATUS: { value: "status" },
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
		// resolution scores against at lock (see fieldPct in @called-my-shot/scoring),
		// just evaluated whenever this is queried instead of frozen at any one moment.
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
		// numeric_guess only - the actual closeness multiplier (see
		// numericGuessPoints/TIER_MIN_MULT/TIER_MAX_MULT in
		// @called-my-shot/scoring) applied at resolution, from closenessMult
		// on the calls table. Null until resolved, and null forever on a miss.
		closenessMult: t.field({
			type: "Float",
			nullable: true,
			resolve: async (call, _args, ctx) =>
				(await canViewerSeePick(call, ctx.user?.id ?? null))
					? call.closenessMult
					: null,
		}),
		// numeric_guess only - what % of the whole field (not just other
		// hitters) guessed at least as close to the actual value as this call
		// did, the raw share closenessMult above was derived from. Exposed
		// separately so the UI can explain the multiplier with a real number
		// ("62% of the field guessed at least this close") instead of inverting
		// the curve client-side. Same visibility/nullability as closenessMult.
		closenessFieldPct: t.field({
			type: "Float",
			nullable: true,
			resolve: async (call, _args, ctx) =>
				(await canViewerSeePick(call, ctx.user?.id ?? null))
					? call.closenessFieldPct
					: null,
		}),
		createdAt: t.field({
			type: "String",
			resolve: (call) => call.createdAt.toISOString(),
		}),
		// live: this call's 1-indexed position among every call on its question,
		// ordered by createdAt - paired client-side with the question's live
		// callCount to preview the earliness tier (see earlyTierFor in
		// @called-my-shot/scoring) before the question resolves. A call's own position
		// can't move once made, so this only ever improves as more calls come in
		// after it; it settles into the true final rank on its own once the
		// question locks and no more calls can land, without needing separate
		// open/resolved logic.
		currentRank: t.field({
			type: "Int",
			resolve: async (call) => {
				// Comparing against a correlated subquery, not `call.createdAt`
				// directly - Postgres timestamps carry microsecond precision but a
				// JS Date only holds milliseconds, so round-tripping the parent's
				// createdAt through JS and back into this query silently truncates
				// it. When the truncated value lands *below* the row's real
				// microsecond-precision value in the DB, `createdAt <= call.createdAt`
				// is false for the call's own row, undercounting it out of its own
				// rank (observed producing rank 0, which should be impossible - the
				// count is inclusive of the row itself). Selecting the comparison
				// value back out of the same table keeps it at full DB precision.
				const [{ n }] = await db
					.select({ n: count() })
					.from(calls)
					.where(
						and(
							eq(calls.questionId, call.questionId),
							lte(
								calls.createdAt,
								sql`(select ${calls.createdAt} from ${calls} where ${calls.id} = ${call.id})`,
							),
						),
					)
				return n
			},
		}),
		user: t.relation("user"),
		question: t.relation("question"),
		// Not pick info - shown even on a locked call to signal "this person
		// tends to be right in this league", the same way identity is. Scoped to
		// this call's own question's league (not the caller's site-wide
		// accuracy) so it reads as relevant context for the question being
		// viewed, not a vanity number. A lean per-user query, not a scan of
		// buildGlobalLeaderboard (which sums every user's calls) - this only
		// needs the one caller's history in the one league.
		callerLeagueAccuracy: t.field({
			type: "Float",
			nullable: true,
			resolve: async (call) => {
				const question = await db.query.questions.findFirst({
					where: { id: call.questionId },
					columns: { leagueId: true },
				})
				if (!question) return null
				const userCalls = await db.query.calls.findMany({
					where: { userId: call.userId },
					with: {
						question: { columns: { leagueId: true } },
						selections: { with: { option: true } },
					},
				})
				const leagueCalls = userCalls.filter(
					(c) => c.question?.leagueId === question.leagueId,
				)
				return accuracyFrom(scoreCalls(leagueCalls))
			},
		}),
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

const GuessBucketRef = builder
	.objectRef<{ value: number; count: number }>("GuessBucket")
	.implement({
		fields: (t) => ({
			value: t.exposeFloat("value"),
			count: t.exposeInt("count"),
		}),
	})

// Shared by the top-level questions feed below and group.ts's createdQuestions
// - both are lists of full Question rows, just filtered differently.
export const QuestionConnectionRef = builder
	.objectRef<Connection<Question>>("QuestionConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [QuestionRef], resolve: (c) => c.items }),
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

		// The single real-world matchup this question is about - null for
		// anything not scoped to one game (season awards, an MVP race).
		game: t.relation("game", { nullable: true }),

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

		// multiple_choice only - true means the option pool below isn't fixed,
		// it grows as castCall itself creates new options (see the resolver).
		// openFieldKind says what kind of entity fills it.
		optionsOpenField: t.exposeBoolean("optionsOpenField"),
		openFieldKind: t.field({
			type: NumericSubjectType,
			nullable: true,
			resolve: (q) => q.openFieldKind,
		}),

		createdAt: t.field({
			type: "String",
			resolve: (q) => q.createdAt.toISOString(),
		}),

		creator: t.relation("creator", { nullable: true }),
		sport: t.relation("sport"),
		league: t.relation("league"),
		// sortOrder is set once at creation (see castQuestion/castCall) to the
		// order the creator/pool actually presented them in - nothing else on
		// questionOptions gives a stable, intentional order, so every consumer
		// of this list (the live picker, the resolve modal, the field
		// breakdown) sees the same one rather than whatever order Postgres
		// happens to return without an explicit sort.
		options: t.relation("options", {
			query: () => ({ orderBy: { sortOrder: "asc" } }),
		}),
		callCount: t.relatedCount("calls"),
		disputes: t.relation("disputes"),

		// Every caller's pick on this question, newest first - the detail page's
		// activity list. Same keyset-cursor shape as myCalls; each item still
		// self-gates its pick fields through canViewerSeePick, this connection
		// just controls which calls are in scope, not what's visible on them.
		calls: t.field({
			type: CallConnectionRef,
			args: { first: t.arg.int(), after: t.arg.string() },
			resolve: async (question, args) => {
				const limit = clampPageSize(args.first)
				const cursor = args.after ? decodeCursor(args.after) : null
				const rows = await db.query.calls.findMany({
					where: {
						questionId: question.id,
						...(cursor ? cursorWhere(cursor) : {}),
					},
					orderBy: { createdAt: "desc", id: "desc" },
					limit: limit + 1,
				})
				return paginate(rows, limit)
			},
		}),

		// Binned guess values for the guess-distribution chart - numeric_guess
		// only, empty for every other type. Bin width is a flat 1 (nearest
		// integer), which fits typical counting stats (points/rebounds/assists)
		// but under-resolves a fractional-scale stat like shooting % - a real
		// fix would derive bin width from numericTolerancePct instead; not
		// needed for v1. Same "aggregate bypasses the per-caller pick-visibility
		// gate" precedent averageGuess/numericHitRatePct already establish -
		// individual bucket counts aren't attributed to any one caller.
		guessDistribution: t.field({
			type: [GuessBucketRef],
			resolve: async (question) => {
				if (question.type !== "numeric_guess") return []
				const guessCalls = await db.query.calls.findMany({
					where: { questionId: question.id },
					columns: { guessValue: true },
				})
				const counts = new Map<number, number>()
				for (const call of guessCalls) {
					if (call.guessValue === null) continue
					const bucket = Math.round(call.guessValue)
					counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
				}
				return [...counts.entries()]
					.sort((a, b) => a[0] - b[0])
					.map(([value, count]) => ({ value, count }))
			},
		}),

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

type AdminQueueSummaryData = {
	needsResolution: Question[]
	probablyStillLive: Question[]
	disputed: (typeof resolutionDisputes.$inferSelect)[]
	liveQuestionsCount: number
	usersLockedCount: number
}

const AdminQueueSummaryRef = builder
	.objectRef<AdminQueueSummaryData>("AdminQueueSummary")
	.implement({
		fields: (t) => ({
			// "Locked a while, likely over" - estimate only (locked-time vs. a
			// typical game length per league, see lib/game-length.ts), not a
			// confirmed final. Has Resolve/Void actions on the frontend.
			needsResolution: t.field({
				type: [QuestionRef],
				resolve: (d) => d.needsResolution,
			}),
			// "Locked recently, probably still live" - same estimate, other side
			// of the threshold. No actions on the frontend - nothing to act on
			// either way without a real result yet.
			probablyStillLive: t.field({
				type: [QuestionRef],
				resolve: (d) => d.probablyStillLive,
			}),
			disputed: t.field({
				type: [ResolutionDisputeRef],
				resolve: (d) => d.disputed,
			}),
			liveQuestionsCount: t.exposeInt("liveQuestionsCount"),
			usersLockedCount: t.exposeInt("usersLockedCount"),
		}),
	})

builder.queryFields((t) => ({
	// The home feed. leagueId/teamId/search narrow the pool, sort picks the
	// ordering - HOT (live call count, the default), NEW (createdAt), or
	// CLOSING_SOON (soonest locksAt among still-open questions). teamId
	// matches either the question's own subjectTeam or any team entered as one
	// of its options (a championship field a team is competing in).
	questions: t.field({
		type: QuestionConnectionRef,
		args: {
			first: t.arg.int(),
			after: t.arg.string(),
			leagueId: t.arg.id(),
			teamId: t.arg.id(),
			search: t.arg.string(),
			// Admin Questions tab only - every other caller of this field leaves it
			// unset and gets every status, same as before this arg existed.
			status: t.arg({ type: QuestionStatus, required: false }),
			sort: t.arg({ type: QuestionSortOrder, required: false }),
		},
		resolve: async (_root, args) => {
			const limit = clampPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			const sort = args.sort ?? "hot"

			const conditions = [
				args.leagueId ? eq(questions.leagueId, args.leagueId) : undefined,
				args.status ? eq(questions.status, args.status) : undefined,
				args.teamId
					? or(
							eq(questions.subjectTeamId, args.teamId),
							exists(
								db
									.select({ one: sql`1` })
									.from(questionOptions)
									.where(
										and(
											eq(questionOptions.questionId, questions.id),
											eq(questionOptions.teamId, args.teamId),
										),
									),
							),
						)
					: undefined,
				args.search
					? or(
							ilike(questions.title, `%${args.search}%`),
							ilike(users.name, `%${args.search}%`),
							ilike(users.username, `%${args.search}%`),
							ilike(teams.name, `%${args.search}%`),
							ilike(teams.abbreviation, `%${args.search}%`),
							ilike(players.name, `%${args.search}%`),
						)
					: undefined,
				// Locked/resolved/disputed questions have nothing left to "close" -
				// closing-soon only makes sense among questions still open. Also
				// bounded to a week out - without this, a sparse feed would pad
				// itself out with questions locking months from now just to fill
				// the page, which doesn't read as "soon" no matter where they rank.
				sort === "closing_soon"
					? and(
							eq(questions.status, "open"),
							lte(
								questions.locksAt,
								DateTime.now().plus({ days: 7 }).toJSDate(),
							),
						)
					: undefined,
			].filter((c) => c !== undefined)

			// Live call count per question, joined in rather than computed with
			// t.relatedCount (as QuestionRef.callCount does) so HOT can ORDER BY
			// it directly instead of sorting the page in application code.
			const callCounts = db.$with("call_counts").as(
				db
					.select({
						questionId: calls.questionId,
						cnt: count(calls.id).as("cnt"),
					})
					.from(calls)
					.groupBy(calls.questionId),
			)

			let query = db
				.with(callCounts)
				.select(getColumns(questions))
				.from(questions)
				.leftJoin(users, eq(users.id, questions.creatorId))
				.leftJoin(teams, eq(teams.id, questions.subjectTeamId))
				.leftJoin(players, eq(players.id, questions.subjectPlayerId))
				.leftJoin(callCounts, eq(callCounts.questionId, questions.id))
				.$dynamic()

			if (conditions.length > 0) {
				query = query.where(and(...conditions))
			}

			query =
				sort === "new"
					? query.orderBy(desc(questions.createdAt), desc(questions.id))
					: sort === "closing_soon"
						? query.orderBy(asc(questions.locksAt), desc(questions.id))
						: query.orderBy(
								desc(sql`coalesce(${callCounts.cnt}, 0)`),
								desc(questions.id),
							)

			const rows = await query.limit(limit + 1).offset(offset)
			const hasNextPage = rows.length > limit
			const items = rows.slice(0, limit)

			return {
				items,
				pageInfo: {
					hasNextPage,
					endCursor:
						items.length > 0 ? encodeOffsetCursor(offset + items.length) : null,
				},
			}
		},
	}),

	// Admin Questions table - every question regardless of status, with real
	// column sort (unlike the public `questions` field above, which only ever
	// ranks by HOT/NEW/CLOSING_SOON). Its own call-count CTE rather than
	// reusing the one above - separate queries, no reason to share a `WITH`.
	adminQuestions: t.field({
		type: QuestionConnectionRef,
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: {
			first: t.arg.int(),
			after: t.arg.string(),
			search: t.arg.string(),
			status: t.arg({ type: QuestionStatus, required: false }),
			sortBy: t.arg({ type: AdminQuestionSort, required: false }),
			sortDir: t.arg({ type: SortDirection, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const limit = clampAdminPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			const sortBy = args.sortBy ?? "title"
			const sortDir = args.sortDir ?? "asc"

			const conditions = [
				args.status ? eq(questions.status, args.status) : undefined,
				args.search
					? or(
							ilike(questions.title, `%${args.search}%`),
							ilike(users.name, `%${args.search}%`),
							ilike(users.username, `%${args.search}%`),
						)
					: undefined,
			].filter((c) => c !== undefined)

			const callCounts = db.$with("admin_question_call_counts").as(
				db
					.select({
						questionId: calls.questionId,
						cnt: count(calls.id).as("cnt"),
					})
					.from(calls)
					.groupBy(calls.questionId),
			)

			let query = db
				.with(callCounts)
				.select(getColumns(questions))
				.from(questions)
				.leftJoin(users, eq(users.id, questions.creatorId))
				.leftJoin(callCounts, eq(callCounts.questionId, questions.id))
				.$dynamic()

			if (conditions.length > 0) {
				query = query.where(and(...conditions))
			}

			query =
				sortBy === "asker"
					? query.orderBy(
							sortColumn(sortDir, users.username),
							asc(questions.id),
						)
					: sortBy === "callers"
						? query.orderBy(
								sortDir === "asc"
									? asc(sql`coalesce(${callCounts.cnt}, 0)`)
									: desc(sql`coalesce(${callCounts.cnt}, 0)`),
								asc(questions.id),
							)
						: query.orderBy(
								sortColumn(
									sortDir,
									sortBy === "type"
										? questions.type
										: sortBy === "status"
											? questions.status
											: questions.title,
								),
								asc(questions.id),
							)

			const rows = await query.limit(limit + 1).offset(offset)
			return buildAdminConnection(rows, limit, offset)
		},
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

	// Queue tab. "Needs resolution" / "probably still live" only ever considers
	// game-scoped questions (gameId set) that are still open past their
	// locksAt - season-long questions (MVP, championship) have no single game
	// to estimate a "likely over" guess off of, and aren't time-sensitive the
	// same way, so they're resolved manually elsewhere and never show up here.
	adminQueueSummary: t.field({
		type: AdminQueueSummaryRef,
		errors: { types: [AuthenticationError, AuthorizationError] },
		resolve: async (_root, _args, ctx) => {
			requireAdmin(ctx)
			const now = new Date()

			const lockedOpenQuestions = await db
				.select({ ...getColumns(questions), leagueSlug: leagues.slug })
				.from(questions)
				.innerJoin(leagues, eq(leagues.id, questions.leagueId))
				.where(
					and(
						eq(questions.status, "open"),
						isNotNull(questions.gameId),
						lte(questions.locksAt, now),
					),
				)

			const needsResolution: Question[] = []
			const probablyStillLive: Question[] = []
			for (const question of lockedOpenQuestions) {
				const hoursSinceLock =
					(now.getTime() - question.locksAt.getTime()) / (1000 * 60 * 60)
				const typicalHours = typicalGameLengthHours(question.leagueSlug)
				;(hoursSinceLock >= typicalHours
					? needsResolution
					: probablyStillLive
				).push(question)
			}

			const disputed = await db.query.resolutionDisputes.findMany({
				where: { status: "open" },
				orderBy: { createdAt: "asc" },
			})

			const [{ n: liveQuestionsCount }] = await db
				.select({ n: count() })
				.from(questions)
				.where(eq(questions.status, "open"))
			const [{ n: usersLockedCount }] = await db
				.select({ n: count() })
				.from(users)
				.where(eq(users.questionCreationEnabled, false))

			return {
				needsResolution,
				probablyStillLive,
				disputed,
				liveQuestionsCount,
				usersLockedCount,
			}
		},
	}),
}))

const QuestionPayload = builder
	.objectRef<{ question: Question }>("QuestionPayload")
	.implement({
		fields: (t) => ({
			question: t.field({
				type: QuestionRef,
				resolve: (payload) => payload.question,
			}),
		}),
	})

const CreateQuestionOptionInput = builder.inputType(
	"CreateQuestionOptionInput",
	{
		fields: (t) => ({
			label: t.string({ required: true }),
			teamId: t.id({ required: false }),
			playerId: t.id({ required: false }),
		}),
	},
)

const CreateQuestionInput = builder.inputType("CreateQuestionInput", {
	fields: (t) => ({
		type: t.field({ type: QuestionType, required: true }),
		category: t.field({ type: QuestionCategory, required: true }),
		title: t.string({ required: true }),
		sportId: t.id({ required: true }),
		leagueId: t.id({ required: true }),

		resolutionSource: t.string({ required: true }),
		resolutionSourceUrl: t.string({ required: false }),
		locksAt: t.string({ required: true }),
		isOfficial: t.boolean({ required: false }),

		// multiple_choice options / multi_select pool
		options: t.field({
			type: [CreateQuestionOptionInput],
			required: false,
		}),

		// over_under, numeric_guess
		statId: t.id({ required: false }),
		customStat: t.string({ required: false }),

		// over_under
		ouLine: t.float({ required: false }),

		// yes_no, over_under, numeric_guess
		numericSubjectType: t.field({
			type: NumericSubjectType,
			required: false,
		}),
		subjectTeamId: t.id({ required: false }),
		subjectPlayerId: t.id({ required: false }),

		// multi_select
		picksRequired: t.int({ required: false }),

		// multiple_choice only
		optionsOpenField: t.boolean({ required: false }),
		openFieldKind: t.field({ type: NumericSubjectType, required: false }),
	}),
})

const CastCallSelectionInput = builder.inputType("CastCallSelectionInput", {
	fields: (t) => ({
		optionId: t.id({ required: true }),
		conviction: t.int({ required: true }),
	}),
})

// multiple_choice on an optionsOpenField question only - a pick not yet among
// the question's existing options. teamId/playerId (whichever openFieldKind
// calls for) is what the resolver actually trusts to find-or-create the
// matching questionOptions row; label is just what gets stored on it.
const CastCallNewOptionInput = builder.inputType("CastCallNewOptionInput", {
	fields: (t) => ({
		label: t.string({ required: true }),
		teamId: t.id({ required: false }),
		playerId: t.id({ required: false }),
		conviction: t.int({ required: true }),
	}),
})

const CastCallInput = builder.inputType("CastCallInput", {
	fields: (t) => ({
		questionId: t.id({ required: true }),
		caseText: t.string({ required: false }),

		// numeric_guess
		guessValue: t.float({ required: false }),
		conviction: t.int({ required: false }),

		// multiple_choice/yes_no/over_under (exactly 1) / multi_select (a
		// question's picksRequired worth)
		selections: t.field({ type: [CastCallSelectionInput], required: false }),

		// multiple_choice on an optionsOpenField question only - alternative to
		// selections when the caller's pick isn't in the pool yet
		newOption: t.field({ type: CastCallNewOptionInput, required: false }),
	}),
})

const CastCallPayload = builder
	.objectRef<{ call: Call }>("CastCallPayload")
	.implement({
		fields: (t) => ({
			call: t.field({ type: CallRef, resolve: (payload) => payload.call }),
		}),
	})

const ResolveQuestionInput = builder.inputType("ResolveQuestionInput", {
	fields: (t) => ({
		questionId: t.id({ required: true }),
		// multiple_choice/yes_no/over_under (exactly 1) / multi_select (the
		// actual winners, not necessarily matching picksRequired)
		correctOptionIds: t.field({ type: ["ID"], required: false }),
		// numeric_guess
		actualValue: t.float({ required: false }),
		resolutionNote: t.string({ required: false }),
	}),
})

const FileDisputeInput = builder.inputType("FileDisputeInput", {
	fields: (t) => ({
		questionId: t.id({ required: true }),
		reason: t.string({ required: true }),
	}),
})

const FileDisputePayload = builder
	.objectRef<{ dispute: typeof resolutionDisputes.$inferSelect }>(
		"FileDisputePayload",
	)
	.implement({
		fields: (t) => ({
			dispute: t.field({
				type: ResolutionDisputeRef,
				resolve: (payload) => payload.dispute,
			}),
		}),
	})

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// The scoring + question-update core of resolving a question - shared by the
// creator-only resolveQuestion below and the admin-only adminResolveQuestion/
// overturnDispute (question.ts's admin mutations further down). Deliberately
// has no auth or status-eligibility checks of its own - every caller already
// had to load and validate `question` itself (different rules per caller:
// resolveQuestion requires the creator and refuses resolved/disputed,
// adminResolveQuestion is admin-only, overturnDispute specifically requires
// disputed), so re-checking here would just be redundant with all of them.
// sourceOverride is only ever passed by the admin callers - regular creator
// resolution never touches resolutionSource/resolutionSourceUrl.
async function resolveQuestionInternal(
	tx: Tx,
	question: Question,
	data: {
		correctOptionIds: string[]
		actualValue?: number
		resolutionNote: string
	},
	sourceOverride?: { resolutionSource?: string; resolutionSourceUrl?: string },
) {
	if (question.type === "numeric_guess") {
		const guessCalls = await tx.query.calls.findMany({
			where: { questionId: question.id },
			columns: {
				id: true,
				guessValue: true,
				conviction: true,
				createdAt: true,
			},
		})
		const guesses = guessCalls
			.filter(
				(c): c is typeof c & { guessValue: number; conviction: number } =>
					c.guessValue !== null && c.conviction !== null,
			)
			.map((c) => ({
				callId: c.id,
				guessValue: c.guessValue,
				conviction: c.conviction,
				createdAt: c.createdAt,
			}))

		// resolveQuestionSchema/adminResolveQuestionSchema guarantee actualValue
		// is set for numeric_guess, and createQuestionSchema guarantees
		// numericTolerancePct was set at creation for this type.
		const scored = numericGuessPoints(
			BASE_POINTS_BY_TYPE[question.type],
			guesses,
			data.actualValue as number,
			question.numericTolerancePct as number,
		)
		for (const r of scored) {
			await tx
				.update(calls)
				.set({
					resultPoints: r.points,
					hitTolerance: r.hit,
					closenessMult: r.closenessMult,
					closenessFieldPct: r.closenessFieldPct,
				})
				.where(eq(calls.id, r.callId))
		}
	} else {
		const options = await tx.query.questionOptions.findMany({
			where: { questionId: question.id },
			columns: { id: true },
		})
		const validIds = new Set(options.map((o) => o.id))
		if (!data.correctOptionIds.every((id) => validIds.has(id))) {
			throw ValidationError.field(
				"correctOptionIds",
				"One or more options don't belong to this question",
			)
		}

		await tx
			.update(questionOptions)
			.set({ isCorrect: true })
			.where(
				and(
					eq(questionOptions.questionId, question.id),
					inArray(questionOptions.id, data.correctOptionIds),
				),
			)
		await tx
			.update(questionOptions)
			.set({ isCorrect: false })
			.where(
				and(
					eq(questionOptions.questionId, question.id),
					notInArray(questionOptions.id, data.correctOptionIds),
				),
			)

		const [{ n: totalCalls }] = await tx
			.select({ n: count() })
			.from(calls)
			.where(eq(calls.questionId, question.id))

		const perOptionCounts = await tx
			.select({ optionId: callSelections.optionId, n: count() })
			.from(callSelections)
			.innerJoin(calls, eq(calls.id, callSelections.callId))
			.where(eq(calls.questionId, question.id))
			.groupBy(callSelections.optionId)
		const countByOption = new Map(perOptionCounts.map((r) => [r.optionId, r.n]))
		const correctOptionIds = new Set(data.correctOptionIds)

		const rawSelections = await tx.query.callSelections.findMany({
			where: { call: { questionId: question.id } },
			columns: { id: true, optionId: true, conviction: true },
			with: { call: { columns: { id: true, createdAt: true } } },
		})
		// The `where` above already filters to selections whose call belongs to
		// this question, so `call` is always present here - this narrows the
		// type Drizzle infers (nullable for every `one` relation regardless of
		// FK nullability) rather than reflecting a real possibility.
		const selections = rawSelections.filter(
			(s): s is typeof s & { call: NonNullable<(typeof s)["call"]> } =>
				s.call !== null,
		)

		// Earliness is a property of the call, not any one selection in it - a
		// multi_select call's picks all share the same createdAt, so this ranks
		// distinct calls, not selections, before mapping back.
		const callsById = new Map(selections.map((s) => [s.call.id, s.call]))
		const orderedCalls = [...callsById.values()].sort(
			(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
		)
		const earlyMultByCallId = new Map(
			orderedCalls.map((c, index) => [
				c.id,
				earlyTierFor(index + 1, totalCalls).mult,
			]),
		)

		for (const s of selections) {
			const pct = fieldPct(countByOption.get(s.optionId) ?? 0, totalCalls)
			const isCorrect = correctOptionIds.has(s.optionId)
			const earlyMult = earlyMultByCallId.get(s.call.id) ?? 1
			const points = selectionPoints(
				BASE_POINTS_BY_TYPE[question.type],
				pct,
				options.length,
				s.conviction,
				isCorrect,
				earlyMult,
			)
			await tx
				.update(callSelections)
				.set({ resultPoints: points })
				.where(eq(callSelections.id, s.id))
		}
	}

	const [updated] = await tx
		.update(questions)
		.set({
			status: "resolved",
			resolvedAt: new Date(),
			resolutionNote: data.resolutionNote || null,
			...(question.type === "numeric_guess"
				? { numericActualValue: data.actualValue }
				: {}),
			...(sourceOverride?.resolutionSource
				? { resolutionSource: sourceOverride.resolutionSource }
				: {}),
			...(sourceOverride?.resolutionSourceUrl !== undefined
				? { resolutionSourceUrl: sourceOverride.resolutionSourceUrl || null }
				: {}),
		})
		.where(eq(questions.id, question.id))
		.returning()

	if (!updated)
		throw new Error(
			"resolveQuestionInternal: question vanished mid-transaction",
		)
	return updated
}

const AdminResolveQuestionInput = builder.inputType(
	"AdminResolveQuestionInput",
	{
		fields: (t) => ({
			questionId: t.id({ required: true }),
			correctOptionIds: t.field({ type: ["ID"], required: false }),
			actualValue: t.float({ required: false }),
			resolutionNote: t.string({ required: false }),
			resolutionSource: t.string({ required: false }),
			resolutionSourceUrl: t.string({ required: false }),
		}),
	},
)

const OverturnDisputeInput = builder.inputType("OverturnDisputeInput", {
	fields: (t) => ({
		disputeId: t.id({ required: true }),
		resolution: t.field({ type: AdminResolveQuestionInput, required: true }),
	}),
})

const UpholdDisputeInput = builder.inputType("UpholdDisputeInput", {
	fields: (t) => ({
		disputeId: t.id({ required: true }),
		note: t.string({ required: false }),
	}),
})

export const VoidReason = builder.enumType("VoidReason", {
	values: {
		NONSENSICAL: { value: "nonsensical" },
		OFF_TOPIC: { value: "off_topic" },
		UNSUPPORTED_SPORT: { value: "unsupported_sport" },
		DUPLICATE: { value: "duplicate" },
		OTHER: { value: "other" },
	},
})

const VoidQuestionInput = builder.inputType("VoidQuestionInput", {
	fields: (t) => ({
		questionId: t.id({ required: true }),
		reason: t.field({ type: VoidReason, required: true }),
		duplicateOfQuestionId: t.id({ required: false }),
		note: t.string({ required: false }),
		countsAsStrike: t.boolean({ required: true }),
	}),
})

const VoidQuestionPayload = builder
	.objectRef<{ questionId: string }>("VoidQuestionPayload")
	.implement({
		fields: (t) => ({
			questionId: t.exposeID("questionId"),
		}),
	})

builder.mutationFields((t) => ({
	createQuestion: t.field({
		type: QuestionPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, ValidationError],
			directResult: true,
			union: { name: "CreateQuestionResult" },
		},
		args: { input: t.arg({ type: CreateQuestionInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const parsed = createQuestionSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}
			const data = parsed.data

			if (data.isOfficial && !user.isAdmin) {
				throw new AuthorizationError("Only admins can post official questions.")
			}

			// numeric_guess's tolerance band comes from the stat's own tolerance
			// tier, not the creator - createQuestionSchema guarantees statId is
			// set (no customStat fallback) for this type specifically, so a
			// creator can't set an unhittable or trivial-to-hit band by hand.
			let numericTolerancePct: number | null = null
			if (data.type === "numeric_guess") {
				const stat = await db.query.stats.findFirst({
					where: { id: data.statId },
					with: { toleranceTier: true },
				})
				if (!stat?.toleranceTier) {
					throw ValidationError.field("statId", "Pick a stat from the list")
				}
				numericTolerancePct = stat.toleranceTier.tolerancePct
			}

			const question = await db.transaction(async (tx) => {
				const [question] = await tx
					.insert(questions)
					.values({
						type: data.type,
						// createQuestionSchema validates category is a member of this
						// enum at runtime (see packages/schemas/src/questions.ts) but
						// keeps its output type as a plain string - the frontend form
						// needs that to represent "no category chosen yet" - so it's
						// narrowed back here for the insert.
						category:
							data.category as (typeof questionCategorySchema.options)[number],
						title: data.title,
						creatorId: user.id,
						isOfficial: data.isOfficial ?? false,
						sportId: data.sportId,
						leagueId: data.leagueId,
						resolutionSource: data.resolutionSource,
						resolutionSourceUrl: data.resolutionSourceUrl || null,
						locksAt: new Date(data.locksAt),
						statId: data.statId ?? null,
						customStat: data.customStat || null,
						ouLine: data.ouLine ?? null,
						numericSubjectType: data.numericSubjectType ?? null,
						subjectTeamId: data.subjectTeamId ?? null,
						subjectPlayerId: data.subjectPlayerId ?? null,
						numericTolerancePct,
						picksRequired: data.picksRequired ?? null,
						optionsOpenField: data.optionsOpenField ?? false,
						openFieldKind: data.optionsOpenField
							? (data.openFieldKind ?? null)
							: null,
					})
					.returning()

				if (data.type === "multiple_choice" || data.type === "multi_select") {
					const options = data.options ?? []
					await tx.insert(questionOptions).values(
						options.map((option, index) => ({
							questionId: question.id,
							label: option.label,
							sortOrder: index,
							teamId: option.teamId ?? null,
							playerId: option.playerId ?? null,
						})),
					)
				} else if (data.type === "yes_no") {
					await tx.insert(questionOptions).values([
						{ questionId: question.id, label: "Yes", sortOrder: 0 },
						{ questionId: question.id, label: "No", sortOrder: 1 },
					])
				} else if (data.type === "over_under") {
					// createQuestionSchema guarantees ouLine is set for over_under.
					await tx.insert(questionOptions).values([
						{
							questionId: question.id,
							label: `Over ${data.ouLine}`,
							sortOrder: 0,
						},
						{
							questionId: question.id,
							label: `Under ${data.ouLine}`,
							sortOrder: 1,
						},
					])
				}

				return question
			})

			return { question }
		},
	}),

	castCall: t.field({
		type: CastCallPayload,
		errors: {
			types: [AuthenticationError, ValidationError, NotFoundError],
			directResult: true,
			union: { name: "CastCallResult" },
		},
		args: { input: t.arg({ type: CastCallInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)

			const question = await db.query.questions.findFirst({
				where: { id: args.input.questionId },
			})
			if (!question) throw new NotFoundError("Question not found")

			// status alone can't be trusted here - nothing in the app ever flips
			// it from "open" to "locked" once locksAt passes (no cron/worker
			// exists), so a stale "open" row past its lock time must still be
			// rejected on the real clock, not the column.
			if (question.status !== "open" || question.locksAt <= new Date()) {
				throw ValidationError.field(
					null,
					"This question is no longer accepting calls.",
				)
			}

			const existing = await db.query.calls.findFirst({
				where: { questionId: question.id, userId: user.id },
			})
			if (existing) {
				throw ValidationError.field(
					null,
					"You've already called this question.",
				)
			}

			const parsed = castCallSchema.safeParse({
				...args.input,
				type: question.type,
			})
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}
			const data = parsed.data

			if (
				data.type === "multi_select" &&
				data.selections.length !== question.picksRequired
			) {
				throw ValidationError.field(
					"selections",
					`Pick exactly ${question.picksRequired} - you picked ${data.selections.length}`,
				)
			}

			if (data.selections.length > 0) {
				const options = await db.query.questionOptions.findMany({
					where: { questionId: question.id },
					columns: { id: true },
				})
				const validIds = new Set(options.map((o) => o.id))
				if (!data.selections.every((s) => validIds.has(s.optionId))) {
					throw ValidationError.field(
						"selections",
						"One or more options don't belong to this question",
					)
				}
			}

			const newOption = data.newOption
			if (newOption) {
				if (question.type !== "multiple_choice" || !question.optionsOpenField) {
					throw ValidationError.field(
						"newOption",
						"This question's options are fixed.",
					)
				}
				const wantsTeam = question.openFieldKind === "team"
				if (wantsTeam && !newOption.teamId) {
					throw ValidationError.field("newOption", "Pick a real team.")
				}
				if (!wantsTeam && !newOption.playerId) {
					throw ValidationError.field("newOption", "Pick a real player.")
				}
			}

			const call = await db.transaction(async (tx) => {
				let selections: { optionId: string; conviction: number }[] =
					data.selections

				// An optionsOpenField pick not yet in the pool - find the matching
				// team/player's existing option (someone else may have already
				// called them) or create one now, the same way the creator's own
				// options get inserted at question-creation time.
				if (newOption) {
					const matchCondition = newOption.teamId
						? eq(questionOptions.teamId, newOption.teamId)
						: eq(questionOptions.playerId, newOption.playerId as string)
					const [existingOption] = await tx
						.select()
						.from(questionOptions)
						.where(
							and(eq(questionOptions.questionId, question.id), matchCondition),
						)
						.limit(1)

					let optionId: string
					if (existingOption) {
						optionId = existingOption.id
					} else {
						const [{ n: sortOrder }] = await tx
							.select({ n: count() })
							.from(questionOptions)
							.where(eq(questionOptions.questionId, question.id))
						const [created] = await tx
							.insert(questionOptions)
							.values({
								questionId: question.id,
								label: newOption.label,
								sortOrder,
								teamId: newOption.teamId ?? null,
								playerId: newOption.playerId ?? null,
							})
							.returning()
						optionId = created.id
					}
					selections = [{ optionId, conviction: newOption.conviction }]
				}

				const [call] = await tx
					.insert(calls)
					.values({
						questionId: question.id,
						userId: user.id,
						caseText: data.caseText || null,
						guessValue:
							data.type === "numeric_guess" ? (data.guessValue ?? null) : null,
						conviction:
							data.type === "numeric_guess" ? (data.conviction ?? null) : null,
					})
					.returning()

				if (selections.length > 0) {
					await tx.insert(callSelections).values(
						selections.map((s) => ({
							callId: call.id,
							optionId: s.optionId,
							conviction: s.conviction,
						})),
					)
				}

				return call
			})

			return { call }
		},
	}),

	resolveQuestion: t.field({
		type: QuestionPayload,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "ResolveQuestionResult" },
		},
		args: { input: t.arg({ type: ResolveQuestionInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)

			const question = await db.transaction(async (tx) => {
				const [question] = await tx
					.select()
					.from(questions)
					.where(eq(questions.id, args.input.questionId))
					.for("update")
				if (!question) throw new NotFoundError("Question not found")
				if (question.creatorId !== user.id) {
					throw new AuthorizationError(
						"Only the creator can resolve this question.",
					)
				}
				if (question.status === "resolved" || question.status === "disputed") {
					throw ValidationError.field(
						null,
						"This question has already been resolved.",
					)
				}
				// Readiness is derived from locksAt, never trusted from status -
				// same reasoning as castCall above.
				if (question.locksAt > new Date()) {
					throw ValidationError.field(null, "This question hasn't locked yet.")
				}

				const parsed = resolveQuestionSchema.safeParse({
					...args.input,
					type: question.type,
				})
				if (!parsed.success) {
					throw ValidationError.fromZodIssues(parsed.error.issues)
				}

				return resolveQuestionInternal(tx, question, parsed.data)
			})

			return { question }
		},
	}),

	// Admin-only counterpart to resolveQuestion above, for a question whose
	// creator never got around to resolving it (the Queue tab's "needs
	// resolution" list). Same eligibility rule as the creator path (open,
	// locksAt already passed) except there's no creator check - any admin can
	// resolve any question - and it can additionally overwrite the
	// creation-time resolutionSource/resolutionSourceUrl with what the admin
	// actually checked.
	adminResolveQuestion: t.field({
		type: QuestionPayload,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "AdminResolveQuestionResult" },
		},
		args: { input: t.arg({ type: AdminResolveQuestionInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)

			const question = await db.transaction(async (tx) => {
				const [question] = await tx
					.select()
					.from(questions)
					.where(eq(questions.id, args.input.questionId))
					.for("update")
				if (!question) throw new NotFoundError("Question not found")
				if (question.status === "resolved" || question.status === "disputed") {
					throw ValidationError.field(
						null,
						"This question has already been resolved.",
					)
				}
				if (question.locksAt > new Date()) {
					throw ValidationError.field(null, "This question hasn't locked yet.")
				}

				const parsed = adminResolveQuestionSchema.safeParse({
					...args.input,
					type: question.type,
				})
				if (!parsed.success) {
					throw ValidationError.fromZodIssues(parsed.error.issues)
				}

				return resolveQuestionInternal(tx, question, parsed.data, {
					resolutionSource: parsed.data.resolutionSource,
					resolutionSourceUrl: parsed.data.resolutionSourceUrl,
				})
			})

			return { question }
		},
	}),

	// Disputes tab's Overturn action - re-runs resolution with a corrected
	// outcome and closes the dispute as overturned. Requires the dispute still
	// be open and its question still disputed (both should always move
	// together, but each is checked independently rather than assumed from
	// the other).
	overturnDispute: t.field({
		type: QuestionPayload,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "OverturnDisputeResult" },
		},
		args: { input: t.arg({ type: OverturnDisputeInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)

			const question = await db.transaction(async (tx) => {
				const [dispute] = await tx
					.select()
					.from(resolutionDisputes)
					.where(eq(resolutionDisputes.id, args.input.disputeId))
					.for("update")
				if (!dispute) throw new NotFoundError("Dispute not found")
				if (dispute.status !== "open") {
					throw ValidationError.field(null, "This dispute is already settled.")
				}

				const [question] = await tx
					.select()
					.from(questions)
					.where(eq(questions.id, dispute.questionId))
					.for("update")
				if (!question) throw new NotFoundError("Question not found")
				if (question.status !== "disputed") {
					throw ValidationError.field(null, "This question isn't disputed.")
				}

				const parsed = adminResolveQuestionSchema.safeParse({
					...args.input.resolution,
					type: question.type,
				})
				if (!parsed.success) {
					throw ValidationError.fromZodIssues(parsed.error.issues)
				}

				const updated = await resolveQuestionInternal(
					tx,
					question,
					parsed.data,
					{
						resolutionSource: parsed.data.resolutionSource,
						resolutionSourceUrl: parsed.data.resolutionSourceUrl,
					},
				)

				await tx
					.update(resolutionDisputes)
					.set({ status: "overturned", resolvedAt: new Date() })
					.where(eq(resolutionDisputes.id, dispute.id))

				return updated
			})

			return { question }
		},
	}),

	// Disputes tab's Uphold action - keeps the original resolution as-is,
	// just closes the dispute. resolutionNote here is the dispute's own note
	// field (shown as the dispute's resolution context), distinct from the
	// question's own resolutionNote which this leaves untouched.
	upholdDispute: t.field({
		type: ResolutionDisputeRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "UpholdDisputeResult" },
		},
		args: { input: t.arg({ type: UpholdDisputeInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)

			return db.transaction(async (tx) => {
				const [dispute] = await tx
					.select()
					.from(resolutionDisputes)
					.where(eq(resolutionDisputes.id, args.input.disputeId))
					.for("update")
				if (!dispute) throw new NotFoundError("Dispute not found")
				if (dispute.status !== "open") {
					throw ValidationError.field(null, "This dispute is already settled.")
				}

				const [updatedDispute] = await tx
					.update(resolutionDisputes)
					.set({
						status: "upheld",
						resolvedAt: new Date(),
						resolutionNote: args.input.note || null,
					})
					.where(eq(resolutionDisputes.id, dispute.id))
					.returning()
				if (!updatedDispute)
					throw new Error("upholdDispute: dispute vanished mid-transaction")

				await tx
					.update(questions)
					.set({ status: "resolved" })
					.where(eq(questions.id, dispute.questionId))

				return updatedDispute
			})
		},
	}),

	// Void = delete the question and everything on it (calls, options,
	// disputes all cascade). Safe pre- or post-resolution: scoring is always
	// computed live from calls/callSelections, nothing persisted per-user
	// needs reversing. questionVoids keeps the audit trail (Users tab's void
	// history, and the strike bookkeeping below) that the hard delete would
	// otherwise erase.
	voidQuestion: t.field({
		type: VoidQuestionPayload,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "VoidQuestionResult" },
		},
		args: { input: t.arg({ type: VoidQuestionInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)
			const parsed = voidQuestionSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const data = parsed.data

			await db.transaction(async (tx) => {
				const [question] = await tx
					.select()
					.from(questions)
					.where(eq(questions.id, data.questionId))
					.for("update")
				if (!question) throw new NotFoundError("Question not found")
				if (question.status !== "open" && question.status !== "disputed") {
					throw ValidationError.field(
						null,
						"Only a live, locked, or disputed question can be voided.",
					)
				}

				if (question.creatorId) {
					await tx.insert(questionVoids).values({
						questionId: question.id,
						questionTitle: question.title,
						targetUserId: question.creatorId,
						voidedByAdminId: admin.id,
						reason: data.reason,
						duplicateOfQuestionId: data.duplicateOfQuestionId,
						note: data.note || null,
						countsAsStrike: data.countsAsStrike,
					})

					if (data.countsAsStrike) {
						const [updatedUser] = await tx
							.update(users)
							.set({ strikeCount: sql`${users.strikeCount} + 1` })
							.where(eq(users.id, question.creatorId))
							.returning()
						if (
							updatedUser &&
							updatedUser.strikeCount >= STRIKE_LOCK_THRESHOLD &&
							updatedUser.questionCreationEnabled
						) {
							await tx
								.update(users)
								.set({ questionCreationEnabled: false })
								.where(eq(users.id, question.creatorId))
						}
					}
				}

				await tx.delete(questions).where(eq(questions.id, question.id))
			})

			return { questionId: data.questionId }
		},
	}),

	fileDispute: t.field({
		type: FileDisputePayload,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "FileDisputeResult" },
		},
		args: { input: t.arg({ type: FileDisputeInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const parsed = fileDisputeSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}
			const data = parsed.data

			const question = await db.query.questions.findFirst({
				where: { id: data.questionId },
			})
			if (!question) throw new NotFoundError("Question not found")
			if (question.status !== "resolved") {
				throw ValidationError.field(
					null,
					"Only resolved questions can be disputed.",
				)
			}

			const callerCall = await db.query.calls.findFirst({
				where: { questionId: data.questionId, userId: user.id },
			})
			if (!callerCall) {
				throw new AuthorizationError(
					"Only callers on this question can dispute its resolution.",
				)
			}

			const existingDispute = await db.query.resolutionDisputes.findFirst({
				where: { questionId: data.questionId, userId: user.id },
			})
			if (existingDispute) {
				throw ValidationError.field(
					null,
					"You've already disputed this question.",
				)
			}

			const dispute = await db.transaction(async (tx) => {
				const [dispute] = await tx
					.insert(resolutionDisputes)
					.values({
						questionId: data.questionId,
						userId: user.id,
						reason: data.reason,
						status: "open",
					})
					.returning()
				await tx
					.update(questions)
					.set({ status: "disputed" })
					.where(eq(questions.id, data.questionId))
				return dispute
			})

			return { dispute }
		},
	}),
}))
