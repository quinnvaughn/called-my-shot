import {
	adminResolveQuestionSchema,
	castCallSchema,
	createQuestionSchema,
	deleteQuestionSchema,
	editQuestionTitleSchema,
	fileDisputeSchema,
	reportQuestionSchema,
	resolveQuestionSchema,
	voidQuestionSchema,
} from "@called-my-shot/schemas"
import {
	BASE_POINTS_BY_SHAPE,
	earlyTierFor,
	fieldPct,
	isSeasonLongShape,
	numericGuessPoints,
	seasonEarlyTierFor,
	selectionPoints,
	type ToleranceSpec,
} from "@called-my-shot/scoring"
import DataLoader from "dataloader"
import {
	and,
	asc,
	count,
	desc,
	eq,
	exists,
	getColumns,
	gt,
	ilike,
	inArray,
	isNotNull,
	lte,
	ne,
	notExists,
	notInArray,
	or,
	sql,
} from "drizzle-orm"
import { DateTime } from "luxon"
import { match } from "ts-pattern"
import { db } from "../../db"
import {
	ballotQuestions,
	type Call,
	callSelections,
	calls,
	games,
	leagues,
	players,
	type Question,
	questionOptions,
	questionReports,
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
import { buildPlayerPool, buildTeamPool } from "../../lib/award-pool"
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
	createNotification,
	createNotifications,
} from "../../lib/notifications"
import { getOfficialAccountId } from "../../lib/official-account"
import {
	clampPageSize,
	cursorWhere,
	decodeCursor,
	decodeOffsetCursor,
	encodeOffsetCursor,
	paginate,
} from "../../lib/pagination"
import { aggregatePointsByUser } from "../../lib/points-aggregate"
import { accuracyFrom } from "../../lib/scoring"
import { getCurrentSeason } from "../../lib/seasons"
import { STRIKE_LOCK_THRESHOLD } from "../../lib/strikes"
import {
	addLeagueStatDelta,
	applySeasonStatDeltas,
	type LeagueStatDelta,
} from "../../lib/user-season-stats"
import { builder } from "../builder"
import type { Context } from "../context"
import { BallotQuestionInput, BallotQuestionRef } from "./ballot"
import { PageInfoRef } from "./pagination"

type Connection<T> = {
	items: T[]
	pageInfo: { hasNextPage: boolean; endCursor: string | null }
}

// One value per concrete kind of question the app supports - replaces the
// old QuestionType + QuestionCategory + NumericSubjectType + open-field-
// toggle combination. Each shape fully determines its required fields and
// its generated title (see generateQuestionTitle in lib/question-title.ts).
export const QuestionShape = builder.enumType("QuestionShape", {
	values: {
		PLAYER_STAT_OVER_UNDER: { value: "player_stat_over_under" },
		TEAM_STAT_OVER_UNDER: { value: "team_stat_over_under" },
		PLAYER_SEASON_STAT_OVER_UNDER: { value: "player_season_stat_over_under" },
		TEAM_SEASON_STAT_OVER_UNDER: { value: "team_season_stat_over_under" },
		GAME_TOTAL_OVER_UNDER: { value: "game_total_over_under" },
		PLAYER_STAT_NUMERIC_GUESS: { value: "player_stat_numeric_guess" },
		TEAM_STAT_NUMERIC_GUESS: { value: "team_stat_numeric_guess" },
		PLAYER_VS_PLAYER: { value: "player_vs_player" },
		PLAYER_VS_PLAYER_SEASON: { value: "player_vs_player_season" },
		YES_NO_PROP: { value: "yes_no_prop" },
		TEAM_VS_TEAM: { value: "team_vs_team" },
		PLAYER_SEASON_AWARD: { value: "player_season_award" },
		TEAM_SEASON_AWARD: { value: "team_season_award" },
		PLAYER_AWARD_FINALISTS: { value: "player_award_finalists" },
		TEAM_SEASON_STAT_NUMERIC_GUESS: { value: "team_season_stat_numeric_guess" },
		PLAYER_GAME_STAT_LEADER: { value: "player_game_stat_leader" },
	},
})

// player_season_award/team_season_award only - see awardVerb on the
// questions table.
export const AwardVerb = builder.enumType("AwardVerb", {
	values: {
		WIN: { value: "win" },
		BE: { value: "be" },
	},
})

// player_season_stat_over_under/team_season_stat_over_under only - see
// statAggregation on the questions table.
export const StatAggregation = builder.enumType("StatAggregation", {
	values: {
		TOTAL: { value: "total" },
		PER_GAME: { value: "per_game" },
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

// Drives ordering for the questions feed. MOST_CALLED ranks by literal call
// count (see call_counts CTE in the questions resolver below) - not a
// stored column, so its pagination uses an offset cursor rather than the
// (createdAt, id) keyset NEW/CLOSING_SOON can use.
const QuestionSortOrder = builder.enumType("QuestionSortOrder", {
	values: {
		MOST_CALLED: { value: "most_called" },
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
		SHAPE: { value: "shape" },
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

const ReportStatus = builder.enumType("ReportStatus", {
	values: {
		OPEN: { value: "open" },
		DISMISSED: { value: "dismissed" },
	},
})

// Defined up here (rather than beside VoidQuestionInput further down) so
// QuestionReportRef below can use it too - a report's reason is deliberately
// the same enum admin voids questions with, just surfaced under a caller-
// facing label set (see lib/report-defaults.ts on the frontend).
export const VoidReason = builder.enumType("VoidReason", {
	values: {
		NONSENSICAL: { value: "nonsensical" },
		OFF_TOPIC: { value: "off_topic" },
		UNSUPPORTED_SPORT: { value: "unsupported_sport" },
		DUPLICATE: { value: "duplicate" },
		OTHER: { value: "other" },
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

// fieldPct below used to run two unbatched findMany calls per option (its own
// selection count, its question's total call count) - a feed page of ~10
// questions with a few options apiece turns that into dozens of sequential
// round trips for one field, the same shape of bug as questionLeagueIdLoaders
// further down. Grouped COUNT queries, one per request per side, instead.
const optionSelectionCountLoaders = new WeakMap<
	Context,
	DataLoader<string, number>
>()
function getOptionSelectionCountLoader(ctx: Context) {
	let loader = optionSelectionCountLoaders.get(ctx)
	if (!loader) {
		loader = new DataLoader<string, number>(async (optionIds) => {
			const ids = [...optionIds]
			const rows = await db
				.select({ optionId: callSelections.optionId, n: count() })
				.from(callSelections)
				.where(inArray(callSelections.optionId, ids))
				.groupBy(callSelections.optionId)
			const countByOption = new Map(rows.map((r) => [r.optionId, r.n]))
			return ids.map((id) => countByOption.get(id) ?? 0)
		})
		optionSelectionCountLoaders.set(ctx, loader)
	}
	return loader
}

const questionCallCountLoaders = new WeakMap<
	Context,
	DataLoader<string, number>
>()
function getQuestionCallCountLoader(ctx: Context) {
	let loader = questionCallCountLoaders.get(ctx)
	if (!loader) {
		loader = new DataLoader<string, number>(async (questionIds) => {
			const ids = [...questionIds]
			const rows = await db
				.select({ questionId: calls.questionId, n: count() })
				.from(calls)
				.where(inArray(calls.questionId, ids))
				.groupBy(calls.questionId)
			const countByQuestion = new Map(rows.map((r) => [r.questionId, r.n]))
			return ids.map((id) => countByQuestion.get(id) ?? 0)
		})
		questionCallCountLoaders.set(ctx, loader)
	}
	return loader
}

// averageGuess/numericHitRatePct/guessDistribution below all used to run
// their own unbatched db.query.calls.findMany per question (every one of
// them, unconditionally - even for shapes where the fields end up null),
// each a duplicate fetch of the same rows. One batched, grouped query per
// request instead, shared by all three.
const questionGuessCallsLoaders = new WeakMap<
	Context,
	DataLoader<
		string,
		{ guessValue: number | null; hitTolerance: boolean | null }[]
	>
>()
function getQuestionGuessCallsLoader(ctx: Context) {
	let loader = questionGuessCallsLoaders.get(ctx)
	if (!loader) {
		loader = new DataLoader(async (questionIds) => {
			const ids = [...questionIds]
			const rows = await db.query.calls.findMany({
				where: { questionId: { in: ids } },
				columns: { questionId: true, guessValue: true, hitTolerance: true },
			})
			const byQuestion = new Map<string, typeof rows>()
			for (const row of rows) {
				const list = byQuestion.get(row.questionId)
				if (list) {
					list.push(row)
				} else {
					byQuestion.set(row.questionId, [row])
				}
			}
			return ids.map((id) => byQuestion.get(id) ?? [])
		})
		questionGuessCallsLoaders.set(ctx, loader)
	}
	return loader
}

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
			resolve: async (option, _args, ctx) => {
				const [selectionCount, questionCallCount] = await Promise.all([
					getOptionSelectionCountLoader(ctx).load(option.id),
					getQuestionCallCountLoader(ctx).load(option.questionId),
				])
				if (questionCallCount === 0) return null
				return fieldPct(selectionCount, questionCallCount)
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

// Shared by seasonGamesPlayed/seasonTotalGames on CallRef below - both need
// the same season-long gate and the same games list (games between season
// start and this question's own locksAt, matching the window
// resolveQuestionInternal bounds by at real resolution time - see that
// function for why locksAt, not a fixed regular-season cutoff, is the right
// boundary). Returns null for a game-scoped question, where neither field is
// meaningful.
async function seasonGamesInWindow(call: Call) {
	const question = await db.query.questions.findFirst({
		where: { id: call.questionId },
		columns: { shape: true, seasonId: true, locksAt: true },
	})
	if (!question || !isSeasonLongShape(question.shape)) return null
	return db
		.select({ startsAt: games.startsAt, status: games.status })
		.from(games)
		.where(
			and(
				eq(games.seasonId, question.seasonId),
				lte(games.startsAt, question.locksAt),
			),
		)
}

// callerLeagueAccuracy below used to run its own db.query.questions.findFirst
// per call just to read that call's question's leagueId - unbatched, same
// shape as the canViewerSeePick N+1 (lib/call-visibility.ts), just simpler:
// this fact has no viewer dependency at all, so it's a plain per-request
// batch keyed by questionId rather than needing a viewer-scoped cache.
const questionLeagueIdLoaders = new WeakMap<
	Context,
	DataLoader<string, string | undefined>
>()

function getQuestionLeagueIdLoader(ctx: Context) {
	let loader = questionLeagueIdLoaders.get(ctx)
	if (!loader) {
		loader = new DataLoader<string, string | undefined>(async (questionIds) => {
			const ids = [...questionIds]
			const rows = await db.query.questions.findMany({
				where: { id: { in: ids } },
				columns: { id: true, leagueId: true },
			})
			const leagueIdById = new Map(rows.map((q) => [q.id, q.leagueId]))
			return ids.map((id) => leagueIdById.get(id))
		})
		questionLeagueIdLoaders.set(ctx, loader)
	}
	return loader
}

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
				(await canViewerSeePick(call, ctx)) ? call.caseText : null,
		}),
		// numeric_guess only - everything else scores through selections
		guessValue: t.field({
			type: "Float",
			nullable: true,
			resolve: async (call, _args, ctx) =>
				(await canViewerSeePick(call, ctx)) ? call.guessValue : null,
		}),
		conviction: t.field({
			type: "Int",
			nullable: true,
			resolve: async (call, _args, ctx) =>
				(await canViewerSeePick(call, ctx)) ? call.conviction : null,
		}),
		hitTolerance: t.field({
			type: "Boolean",
			nullable: true,
			resolve: async (call, _args, ctx) =>
				(await canViewerSeePick(call, ctx)) ? call.hitTolerance : null,
		}),
		// numeric_guess only - the actual closeness multiplier (see
		// numericGuessPoints/TIER_MIN_MULT/TIER_MAX_MULT in
		// @called-my-shot/scoring) applied at resolution, from closenessMult
		// on the calls table. Null until resolved, and null forever on a miss.
		closenessMult: t.field({
			type: "Float",
			nullable: true,
			resolve: async (call, _args, ctx) =>
				(await canViewerSeePick(call, ctx)) ? call.closenessMult : null,
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
				(await canViewerSeePick(call, ctx)) ? call.closenessFieldPct : null,
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
		// Season-long shapes only (see SEASON_LONG_SHAPES/isSeasonLongShape in
		// @called-my-shot/scoring) - null for a game-scoped question, where
		// seasonEarlyTierFor doesn't apply. Paired with seasonTotalGames below to
		// preview seasonEarlyTierFor client-side before resolution, the
		// season-long counterpart to currentRank/callCount above. Unlike rank,
		// this doesn't shift as more calls come in - it's fixed the moment this
		// call's createdAt happens, since gamesPlayed only depends on which games
		// in the window were already final by then, not on other callers.
		seasonGamesPlayed: t.field({
			type: "Int",
			nullable: true,
			resolve: async (call) => {
				const seasonGames = await seasonGamesInWindow(call)
				if (!seasonGames) return null
				return seasonGames.filter(
					(g) => g.status === "final" && g.startsAt <= call.createdAt,
				).length
			},
		}),
		// Total games in the same window seasonGamesPlayed counts against - see
		// seasonGamesInWindow above for how that window is bounded.
		seasonTotalGames: t.field({
			type: "Int",
			nullable: true,
			resolve: async (call) => {
				const seasonGames = await seasonGamesInWindow(call)
				return seasonGames?.length ?? null
			},
		}),
		user: t.relation("user"),
		question: t.relation("question"),
		// Not pick info - shown even on a locked call to signal "this person
		// tends to be right in this league", the same way identity is. Scoped to
		// this call's own question's league (not the caller's site-wide
		// accuracy) so it reads as relevant context for the question being
		// viewed, not a vanity number. A single-user, league-scoped SQL
		// aggregate, not a scan of buildGlobalLeaderboard (which sums every
		// user's calls) or a fetch of every call this user has ever made.
		callerLeagueAccuracy: t.field({
			type: "Float",
			nullable: true,
			resolve: async (call, _args, ctx) => {
				const leagueId = await getQuestionLeagueIdLoader(ctx).load(
					call.questionId,
				)
				if (!leagueId) return null
				const agg = await aggregatePointsByUser({
					userIds: [call.userId],
					leagueId,
				})
				const summary = agg.get(call.userId)
				return summary ? accuracyFrom(summary) : null
			},
		}),
		selections: t.field({
			type: [CallSelectionRef],
			resolve: async (call, _args, ctx) => {
				if (!(await canViewerSeePick(call, ctx))) return []
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
			resolve: (call, _args, ctx) => canViewerSeePick(call, ctx),
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

export const QuestionReportRef = builder.drizzleObject("questionReports", {
	name: "QuestionReport",
	fields: (t) => ({
		id: t.exposeID("id"),
		reason: t.field({ type: VoidReason, resolve: (r) => r.reason }),
		details: t.exposeString("details", { nullable: true }),
		status: t.field({ type: ReportStatus, resolve: (r) => r.status }),
		createdAt: t.field({
			type: "String",
			resolve: (r) => r.createdAt.toISOString(),
		}),
		reviewedAt: t.field({
			type: "String",
			nullable: true,
			resolve: (r) => r.reviewedAt?.toISOString() ?? null,
		}),
		reportedBy: t.relation("reportedBy"),
		question: t.relation("question"),
	}),
})

export const QuestionRef = builder.drizzleObject("questions", {
	name: "Question",
	fields: (t) => ({
		id: t.exposeID("id"),
		shape: t.field({ type: QuestionShape, resolve: (q) => q.shape }),
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

		// *_over_under, *_numeric_guess, and player_vs_player only - stat is the
		// catalog-backed default, customStat is the escape hatch used when stat
		// is null (never set for the two numeric-guess shapes, which require a
		// catalog stat)
		stat: t.relation("stat", { nullable: true }),
		customStat: t.exposeString("customStat", { nullable: true }),

		// *_over_under shapes only
		ouLine: t.exposeFloat("ouLine", { nullable: true }),

		// player_season_stat_over_under/team_season_stat_over_under only
		statAggregation: t.field({
			type: StatAggregation,
			nullable: true,
			resolve: (q) => q.statAggregation,
		}),

		// player_stat_over_under/numeric_guess, team_stat_over_under/
		// numeric_guess (required), yes_no_prop (optional - null for a
		// subject-less proposition)
		subjectTeam: t.relation("subjectTeam", { nullable: true }),
		subjectPlayer: t.relation("subjectPlayer", { nullable: true }),

		// yes_no_prop only
		eventClause: t.exposeString("eventClause", { nullable: true }),

		// player_season_award/team_season_award/player_award_finalists only
		awardName: t.exposeString("awardName", { nullable: true }),

		// player_season_award/team_season_award only - see AwardVerb above.
		awardVerb: t.field({
			type: AwardVerb,
			nullable: true,
			resolve: (q) => q.awardVerb,
		}),

		// player_season_award/team_season_award only - the conference/division/
		// position values the pool was narrowed to (IN filtering) at creation
		// time, if any.
		awardConferences: t.field({
			type: ["String"],
			nullable: true,
			resolve: (q) => q.awardConferences,
		}),
		awardDivisions: t.field({
			type: ["String"],
			nullable: true,
			resolve: (q) => q.awardDivisions,
		}),
		awardPositions: t.field({
			type: ["String"],
			nullable: true,
			resolve: (q) => q.awardPositions,
		}),
		awardSeasonsInLeague: t.field({
			type: ["Int"],
			nullable: true,
			resolve: (q) => q.awardSeasonsInLeague,
		}),
		awardRookieOnly: t.field({
			type: "Boolean",
			nullable: true,
			resolve: (q) => q.awardRookieOnly,
		}),

		// The two numeric-guess shapes only. Exactly one of numericTolerancePct/
		// numericToleranceAbsolute is set, depending on the picked stat's
		// tolerance tier mode (see ToleranceSpec in @called-my-shot/scoring).
		numericTolerancePct: t.exposeFloat("numericTolerancePct", {
			nullable: true,
		}),
		numericToleranceAbsolute: t.exposeFloat("numericToleranceAbsolute", {
			nullable: true,
		}),
		numericActualValue: t.exposeFloat("numericActualValue", { nullable: true }),
		// live average of every guessValue submitted so far - numeric-guess
		// shapes only, null until at least one call exists
		averageGuess: t.field({
			type: "Float",
			nullable: true,
			resolve: async (question, _args, ctx) => {
				const calls = await getQuestionGuessCallsLoader(ctx).load(question.id)
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
			resolve: async (question, _args, ctx) => {
				const calls = await getQuestionGuessCallsLoader(ctx).load(question.id)
				const scored = calls.filter(
					(call): call is typeof call & { hitTolerance: boolean } =>
						call.hitTolerance !== null,
				)
				if (scored.length === 0) return null
				const hits = scored.filter((call) => call.hitTolerance).length
				return (hits / scored.length) * 100
			},
		}),

		// Season-long shapes only (see SEASON_LONG_SHAPES/isSeasonLongShape in
		// @called-my-shot/scoring) - games already final as of right now (not any
		// particular call's createdAt, since this is the live preview shown
		// while still picking, before a call necessarily exists - see
		// CallRef.seasonGamesPlayed for the per-call, frozen-at-createdAt
		// counterpart used once a call is real). Bounded by both "now" and this
		// question's own locksAt so a query that lands after lock (but before
		// resolution) can't overcount games that happened after the real cutoff
		// any eventual call would have been scored against.
		seasonGamesPlayed: t.field({
			type: "Int",
			nullable: true,
			resolve: async (question) => {
				if (!isSeasonLongShape(question.shape)) return null
				const [{ n }] = await db
					.select({ n: count() })
					.from(games)
					.where(
						and(
							eq(games.seasonId, question.seasonId),
							eq(games.status, "final"),
							lte(games.startsAt, new Date()),
							lte(games.startsAt, question.locksAt),
						),
					)
				return n
			},
		}),
		// Total games in the same window seasonGamesPlayed counts against -
		// games scheduled between season start and this question's own locksAt,
		// matching CallRef.seasonTotalGames's window exactly.
		seasonTotalGames: t.field({
			type: "Int",
			nullable: true,
			resolve: async (question) => {
				if (!isSeasonLongShape(question.shape)) return null
				const [{ n }] = await db
					.select({ n: count() })
					.from(games)
					.where(
						and(
							eq(games.seasonId, question.seasonId),
							lte(games.startsAt, question.locksAt),
						),
					)
				return n
			},
		}),

		// player_season_award/team_season_award only
		picksRequired: t.exposeInt("picksRequired", { nullable: true }),

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

		// True once any dispute on this question has been closed (upheld or
		// overturned) - fileDispute refuses to reopen the dispute process past
		// that point, so this also gates whether "Dispute this resolution" shows.
		hasSettledDispute: t.field({
			type: "Boolean",
			resolve: async (question) => {
				const settled = await db.query.resolutionDisputes.findFirst({
					where: {
						questionId: question.id,
						status: { in: ["upheld", "overturned"] },
					},
				})
				return settled != null
			},
		}),

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

		// Binned guess values for the guess-distribution chart - the two
		// numeric-guess shapes only, empty for every other shape. Bin width
		// matches the question's own tolerance band (numericToleranceAbsolute
		// when the stat is a rate stat, else a flat 1) - a guess within one
		// tolerance band of another is "close enough" to group together, which
		// generalizes correctly whether the band is a whole-number counting-stat
		// amount or a small fixed rate-stat amount like +/-0.02. Rounded to 3
		// decimal places (matching guessValue's own column scale) to avoid
		// floating-point bucket-key drift. Same "aggregate bypasses the
		// per-caller pick-visibility gate" precedent averageGuess/
		// numericHitRatePct already establish - individual bucket counts aren't
		// attributed to any one caller.
		guessDistribution: t.field({
			type: [GuessBucketRef],
			resolve: async (question, _args, ctx) => {
				if (
					question.shape !== "player_stat_numeric_guess" &&
					question.shape !== "team_stat_numeric_guess"
				)
					return []
				const guessCalls = await getQuestionGuessCallsLoader(ctx).load(
					question.id,
				)
				const bucketWidth = question.numericToleranceAbsolute ?? 1
				const counts = new Map<number, number>()
				for (const call of guessCalls) {
					if (call.guessValue === null) continue
					const bucket =
						Math.round(
							Math.round(call.guessValue / bucketWidth) * bucketWidth * 1000,
						) / 1000
					counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
				}
				return [...counts.entries()]
					.sort((a, b) => a[0] - b[0])
					.map(([value, count]) => ({ value, count }))
			},
		}),

		// Dataloader-backed rather than a plain findFirst per question - a list
		// of N questions (the home feed, my-calls, group tabs, ...) used to
		// fire N separate queries for this one field alone. Invisible when
		// signed out (ctx.user null short-circuits before any query), which is
		// exactly why it went unnoticed - every anonymous/dev-scale test of
		// these lists looked fine. load() batches the whole page's questionIds
		// into a single `IN (...)` query per request.
		viewerCall: t.loadable({
			type: CallRef,
			nullable: true,
			load: async (questionIds: string[], ctx) => {
				if (!ctx.user) return questionIds.map(() => null)
				const found = await db.query.calls.findMany({
					where: {
						questionId: { in: questionIds },
						userId: ctx.user.id,
					},
				})
				const byQuestionId = new Map(
					found.map((call) => [call.questionId, call]),
				)
				return questionIds.map((id) => byQuestionId.get(id) ?? null)
			},
			resolve: (question) => question.id,
		}),

		viewerDispute: t.field({
			type: ResolutionDisputeRef,
			nullable: true,
			resolve: (question, _args, ctx) => {
				if (!ctx.user) return null
				return db.query.resolutionDisputes.findFirst({
					where: {
						questionId: question.id,
						userId: ctx.user.id,
						status: "open",
					},
				})
			},
		}),
		viewerReport: t.field({
			type: QuestionReportRef,
			nullable: true,
			resolve: (question, _args, ctx) => {
				if (!ctx.user) return null
				return db.query.questionReports.findFirst({
					where: { questionId: question.id, reportedByUserId: ctx.user.id },
				})
			},
		}),

		// Batched by questionId, same pattern as viewerCall above - a feed page
		// of N questions fires one IN (...) query for this field, not N. Only
		// surfaces a membership row when its ballot is actually published - a
		// draft ballot's members render as fully standalone questions, same as
		// if they weren't in any ballot at all.
		ballotMembership: t.loadable({
			type: BallotQuestionRef,
			nullable: true,
			load: async (questionIds: string[]) => {
				const found = await db.query.ballotQuestions.findMany({
					where: { questionId: { in: questionIds } },
					with: { ballot: true },
				})
				const byQuestionId = new Map(
					found
						.filter((row) => row.ballot?.status === "published")
						.map((row) => [row.questionId, row]),
				)
				return questionIds.map((id) => byQuestionId.get(id) ?? null)
			},
			resolve: (question) => question.id,
		}),
	}),
})

type AdminQueueSummaryData = {
	needsResolution: Question[]
	probablyStillLive: Question[]
	disputed: (typeof resolutionDisputes.$inferSelect)[]
	reported: (typeof questionReports.$inferSelect)[]
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
			reported: t.field({
				type: [QuestionReportRef],
				resolve: (d) => d.reported,
			}),
			liveQuestionsCount: t.exposeInt("liveQuestionsCount"),
			usersLockedCount: t.exposeInt("usersLockedCount"),
		}),
	})

builder.queryFields((t) => ({
	// The home feed. leagueId/teamId/search/isOfficial narrow the pool, sort
	// picks the ordering - MOST_CALLED (literal call count, the default), NEW
	// (createdAt), or CLOSING_SOON (soonest locksAt among still-open
	// questions). teamId matches either the question's own subjectTeam or any
	// team entered as one of its options (a championship field a team is
	// competing in).
	questions: t.field({
		type: QuestionConnectionRef,
		args: {
			first: t.arg.int(),
			after: t.arg.string(),
			leagueId: t.arg.id(),
			teamId: t.arg.id(),
			// The game detail page's question list - every question tied to one
			// game, hero (team_vs_team) included. Nothing else passes this today.
			gameId: t.arg.id(),
			search: t.arg.string(),
			// Admin Questions tab only - every other caller of this field leaves it
			// unset and gets every status, same as before this arg existed.
			status: t.arg({ type: QuestionStatus, required: false }),
			// Lets the home feed narrow to admin-curated content (synced
			// team_vs_team questions, season awards) or exclude it - a plain
			// boolean check (`args.isOfficial ?`) would treat isOfficial: false
			// the same as "unset" and silently drop the "community only" half of
			// the filter, so this checks for the arg actually being present.
			isOfficial: t.arg.boolean({ required: false }),
			sort: t.arg({ type: QuestionSortOrder, required: false }),
			// The league room's Feed tab only - season award singles and ballot
			// positions get their own Season tab there, so the feed excludes
			// anything already in a ballot to avoid showing it twice. Every other
			// caller (home, groups) leaves this unset and sees everything, same as
			// before this arg existed.
			excludeBallotMembers: t.arg.boolean({ required: false }),
			// The league room's Feed tab only - a locked-but-unresolved question
			// has nothing left to do with it from a browse list (can't call it,
			// no outcome to see yet either), unlike resolved (still has an
			// outcome worth seeing) or disputed. Every other caller leaves this
			// unset and sees every status, same as before this arg existed.
			excludeLocked: t.arg.boolean({ required: false }),
			// The league room's Feed tab only - team_vs_team questions are synced
			// onto every upcoming game of the current season now (see
			// syncGameQuestions), which would otherwise flood this browse list;
			// each one already has its own home as the game detail page's hero
			// card, reached via the Games tab. Every other caller leaves this
			// unset and sees every shape.
			excludeGameWinners: t.arg.boolean({ required: false }),
			// The league room's Feed tab only - standalone season award races
			// (player_season_award/team_season_award/player_award_finalists)
			// already have their own dedicated home on the Season tab, same
			// reasoning as excludeGameWinners above. Every other caller leaves
			// this unset and sees every shape.
			excludeSeasonAwards: t.arg.boolean({ required: false }),
			// The league room's Feed tab's New sort only - a resolved/disputed
			// question has nothing left to act on, which is the whole point of
			// browsing by "New" (contrast excludeLocked above: that arg keeps
			// resolved/disputed around deliberately, since they still have an
			// outcome worth seeing under Most Called/Closing Soon - New is the
			// one sort where "already decided" doesn't belong). Every other
			// caller leaves this unset and sees every status.
			excludeSettled: t.arg.boolean({ required: false }),
			// The league room's Season tab, narrowed to standalone award races
			// (player_season_award/team_season_award/player_award_finalists) -
			// every other caller leaves this unset and gets every shape.
			shapes: t.arg({ type: [QuestionShape], required: false }),
			// The league room's Season tab only - scoped to the current season
			// (in progress, else soonest upcoming, else most recently completed -
			// see getCurrentSeason) so a prior year's award questions don't
			// linger alongside this year's. Requires leagueId; every other
			// caller leaves this unset and gets every season.
			currentSeasonOnly: t.arg.boolean({ required: false }),
		},
		resolve: async (_root, args) => {
			const limit = clampPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			const sort = args.sort ?? "most_called"
			const currentSeason =
				args.currentSeasonOnly && args.leagueId
					? await getCurrentSeason(args.leagueId)
					: null

			const conditions = [
				args.leagueId ? eq(questions.leagueId, args.leagueId) : undefined,
				args.gameId ? eq(questions.gameId, args.gameId) : undefined,
				args.status ? eq(questions.status, args.status) : undefined,
				typeof args.isOfficial === "boolean"
					? eq(questions.isOfficial, args.isOfficial)
					: undefined,
				args.shapes && args.shapes.length > 0
					? inArray(questions.shape, args.shapes)
					: undefined,
				currentSeason ? eq(questions.seasonId, currentSeason.id) : undefined,
				args.excludeBallotMembers
					? notExists(
							db
								.select({ one: sql`1` })
								.from(ballotQuestions)
								.where(eq(ballotQuestions.questionId, questions.id)),
						)
					: undefined,
				args.excludeLocked ? ne(questions.status, "locked") : undefined,
				args.excludeGameWinners
					? ne(questions.shape, "team_vs_team")
					: undefined,
				args.excludeSeasonAwards
					? notInArray(questions.shape, [
							"player_season_award",
							"team_season_award",
							"player_award_finalists",
						])
					: undefined,
				args.excludeSettled
					? notInArray(questions.status, ["resolved", "disputed"])
					: undefined,
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
				// closing-soon only makes sense among questions still open. status
				// alone isn't enough, though: nothing flips it off "open" the
				// instant locksAt passes (no cron/worker - see the comment on
				// resolveQuestion below), so a game-linked question can sit
				// "open" for days after its game already started. Excluding
				// anything whose locksAt is already in the past keeps those out
				// of "soon". Also bounded to 48 hours out - a week doesn't read
				// as "soon", and without some bound a sparse feed would pad
				// itself out with questions locking days from now just to fill
				// the page.
				sort === "closing_soon"
					? and(
							eq(questions.status, "open"),
							gt(questions.locksAt, new Date()),
							lte(
								questions.locksAt,
								DateTime.now().plus({ hours: 48 }).toJSDate(),
							),
						)
					: undefined,
			].filter((c) => c !== undefined)

			// Live call count per question, joined in rather than computed with
			// t.relatedCount (as QuestionRef.callCount does) so MOST_CALLED can
			// ORDER BY it directly instead of sorting the page in application code.
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
					? // Second key is locksAt, not just id - a sync run can insert a
						// whole batch (e.g. every game entering syncGameQuestions'
						// creation window in one run - see apps/api/src/db/sync/
						// sync-game-questions.ts) with createdAt values only
						// microseconds apart, and id (random per row) wouldn't
						// resolve that into anything sensible. locksAt ascending
						// means a same-instant batch still reads soonest-first
						// within itself, same "what's actually coming up" ordering
						// CLOSING_SOON uses on its own.
						query.orderBy(
							desc(questions.createdAt),
							asc(questions.locksAt),
							desc(questions.id),
						)
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
	// ranks by MOST_CALLED/NEW/CLOSING_SOON). Its own call-count CTE rather than
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
			leagueId: t.arg.id({ required: false }),
			// The Ballots builder's "attach existing" picker - questions that
			// don't already belong to a ballot (a question can only ever be in
			// one, see ballotQuestions.questionId's unique constraint).
			unassignedToBallot: t.arg.boolean({ required: false }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const limit = clampAdminPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			const sortBy = args.sortBy ?? "title"
			const sortDir = args.sortDir ?? "asc"

			const conditions = [
				args.status ? eq(questions.status, args.status) : undefined,
				args.leagueId ? eq(questions.leagueId, args.leagueId) : undefined,
				args.unassignedToBallot
					? notExists(
							db
								.select()
								.from(ballotQuestions)
								.where(eq(ballotQuestions.questionId, questions.id)),
						)
					: undefined,
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
									sortBy === "shape"
										? questions.shape
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

	// Home's "Just resolved" - bounded to a handful, ordered by when the
	// question actually resolved (not when the call was made, unlike myCalls'
	// createdAt-desc order) so this reads as "recently decided," not "recently
	// picked." Not paginated - a small fixed list, not a page of My Calls.
	myRecentResolvedCalls: t.field({
		type: [CallRef],
		args: { first: t.arg.int({ required: false }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const limit = Math.min(Math.max(args.first ?? 5, 1), 20)
			// RQBv2's orderBy can't sort by a relation's column, and a resolved
			// call's own createdAt (when it was MADE) isn't what "recently
			// resolved" means - so this fetches with the question attached and
			// sorts on resolvedAt in application code instead of the DB. A
			// viewer's lifetime resolved-call count is small enough that this
			// isn't a real cost, unlike a site-wide query would be.
			const rows = await db.query.calls.findMany({
				where: { userId: user.id, question: { status: "resolved" } },
				with: { question: { columns: { resolvedAt: true } } },
			})
			return rows
				.filter((row) => row.question?.resolvedAt)
				.sort(
					(a, b) =>
						(b.question?.resolvedAt?.getTime() ?? 0) -
						(a.question?.resolvedAt?.getTime() ?? 0),
				)
				.slice(0, limit)
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

	// The "My Questions" page - every question the viewer has asked, newest
	// first, across every status (live, locked, resolved).
	myQuestions: t.field({
		type: QuestionConnectionRef,
		args: {
			first: t.arg.int(),
			after: t.arg.string(),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const limit = clampPageSize(args.first)
			const cursor = args.after ? decodeCursor(args.after) : null
			const rows = await db.query.questions.findMany({
				where: {
					creatorId: user.id,
					...(cursor ? cursorWhere(cursor) : {}),
				},
				orderBy: { createdAt: "desc", id: "desc" },
				limit: limit + 1,
			})
			return paginate(rows, limit)
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

			const reported = await db.query.questionReports.findMany({
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
				reported,
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
		shape: t.field({ type: QuestionShape, required: true }),
		sportId: t.id({ required: true }),
		leagueId: t.id({ required: true }),
		gameId: t.id({ required: false }),

		// Required - the create-question form prefills this from
		// generateQuestionTitle and lets the creator edit it, since the
		// generated phrasing doesn't always read naturally (an unusual stat or
		// award name especially). The server trusts whatever's here rather than
		// regenerating its own copy.
		title: t.string({ required: true }),

		resolutionSource: t.string({ required: true }),
		resolutionSourceUrl: t.string({ required: false }),
		locksAt: t.string({ required: true }),
		isOfficial: t.boolean({ required: false }),

		// player_vs_player (exactly 2), award pools (player_season_award/
		// team_season_award), player_award_finalists (2+) - not sent for
		// team_vs_team, which the resolver derives from the picked game
		options: t.field({
			type: [CreateQuestionOptionInput],
			required: false,
		}),

		// *_over_under, *_numeric_guess, player_vs_player
		statId: t.id({ required: false }),
		customStat: t.string({ required: false }),

		// *_over_under
		ouLine: t.float({ required: false }),

		// player_season_stat_over_under/team_season_stat_over_under
		statAggregation: t.field({ type: StatAggregation, required: false }),

		// player/team_stat_over_under, player/team_stat_numeric_guess
		// (required), yes_no_prop (optional)
		subjectTeamId: t.id({ required: false }),
		subjectPlayerId: t.id({ required: false }),

		// player_season_award/team_season_award
		picksRequired: t.int({ required: false }),
		// player_season_award/team_season_award only - see AwardVerb above.
		awardVerb: t.field({ type: AwardVerb, required: false }),

		// yes_no_prop only
		eventClause: t.string({ required: false }),

		// player_season_award/team_season_award/player_award_finalists
		awardName: t.string({ required: false }),

		// player_season_award/team_season_award only - narrows the pool the
		// resolver derives server-side (see createQuestion below) instead of
		// the whole league. IN filtering - e.g. ["SP", "RP"] for a Cy Young race
		// that spans both starters and relievers.
		awardConferences: t.field({ type: ["String"], required: false }),
		awardDivisions: t.field({ type: ["String"], required: false }),
		// player_season_award only
		awardPositions: t.field({ type: ["String"], required: false }),
		// player_season_award only - a genuine exact-experience-year race (e.g.
		// [1] for a "best second-year player" poll). NOT used for Rookie of the
		// Year - see awardRookieOnly below.
		awardSeasonsInLeague: t.field({ type: ["Int"], required: false }),
		// player_season_award only - narrows the pool to rookie-eligible players
		// per that sport's own real rookie rule. The mechanism for every real
		// Rookie of the Year question regardless of sport.
		awardRookieOnly: t.field({ type: "Boolean", required: false }),

		// Admin-only placement into a Ballot - absent for the overwhelming
		// majority of questions, which aren't part of any ballot. Forces
		// isOfficial (see createQuestionSchema's superRefine).
		ballot: t.field({ type: BallotQuestionInput, required: false }),
	}),
})

const CastCallSelectionInput = builder.inputType("CastCallSelectionInput", {
	fields: (t) => ({
		optionId: t.id({ required: true }),
		conviction: t.int({ required: true }),
	}),
})

const CastCallInput = builder.inputType("CastCallInput", {
	fields: (t) => ({
		questionId: t.id({ required: true }),
		caseText: t.string({ required: false }),

		// player_stat_numeric_guess, team_stat_numeric_guess
		guessValue: t.float({ required: false }),
		conviction: t.int({ required: false }),

		// Every other shape: exactly 1, except player_season_award/
		// team_season_award (a question's picksRequired worth)
		selections: t.field({ type: [CastCallSelectionInput], required: false }),
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
		// Every other shape: exactly 1. player_season_award/team_season_award:
		// the actual winners, not necessarily matching picksRequired
		correctOptionIds: t.field({ type: ["ID"], required: false }),
		// player_stat_numeric_guess, team_stat_numeric_guess
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
// resolution never touches resolutionSource/resolutionSourceUrl. Exported for
// db/sync/sync-live-scores.ts, which resolves a game's team_vs_team question
// straight off ESPN's final score the same way - same "caller already
// validated eligibility" contract applies there too.
export async function resolveQuestionInternal(
	tx: Tx,
	question: Question,
	data: {
		correctOptionIds: string[]
		actualValue?: number
		resolutionNote: string
	},
	sourceOverride?: { resolutionSource?: string; resolutionSourceUrl?: string },
) {
	// Accumulates each affected user's net (points, resolvedCallCount,
	// correctCount) change across this call - not the new totals themselves,
	// since overturnDispute can re-run this against a question that was
	// already resolved once, and the calls/selections below still carry their
	// *previous* values when that happens (there is no reset step). Using
	// (new - old) instead of (new) keeps user_league_stats correct on a
	// re-resolve instead of double-counting the prior award. callCount is
	// never touched here - it only changes at castCall/voidQuestion time.
	const statDeltas = new Map<string, LeagueStatDelta>()
	// What each user's call is actually worth after this resolution (summed
	// across every selection on a multi-pick award) - deliberately NOT the
	// same number as statDeltas' points above. On a first-time resolution the
	// two are equal (there was nothing to claw back), but on a re-resolve
	// (overturnDispute) statDeltas' delta also nets out the prior, now-wrong
	// award, which is correct for the season-stats total but reads as a wildly
	// overstated loss in a "your call on X missed" notification - a caller
	// only cares what their call is worth now, not the size of the portfolio
	// swing that got them there.
	const newPointsByUserId = new Map<string, number>()

	const isNumericGuess =
		question.shape === "player_stat_numeric_guess" ||
		question.shape === "team_stat_numeric_guess" ||
		question.shape === "team_season_stat_numeric_guess"

	if (isNumericGuess) {
		const guessCalls = await tx.query.calls.findMany({
			where: { questionId: question.id },
			columns: {
				id: true,
				userId: true,
				guessValue: true,
				conviction: true,
				resultPoints: true,
				hitTolerance: true,
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
		// is set for the two numeric-guess shapes, and createQuestionSchema
		// guarantees exactly one of numericTolerancePct/numericToleranceAbsolute
		// was set at creation for them, matching the picked stat's tolerance
		// tier mode.
		const toleranceSpec: ToleranceSpec =
			question.numericToleranceAbsolute !== null
				? { mode: "absolute", amount: question.numericToleranceAbsolute }
				: { mode: "percentage", pct: question.numericTolerancePct as number }
		const scored = numericGuessPoints(
			BASE_POINTS_BY_SHAPE[question.shape],
			guesses,
			data.actualValue as number,
			toleranceSpec,
		)
		const oldByCallId = new Map(guessCalls.map((c) => [c.id, c]))
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

			const prior = oldByCallId.get(r.callId)
			if (prior) {
				const wasResolved = prior.resultPoints !== null
				const wasCorrect = wasResolved && prior.hitTolerance === true
				const isCorrect = r.hit === true
				addLeagueStatDelta(statDeltas, prior.userId, {
					points: r.points - (prior.resultPoints ?? 0),
					resolvedCallCount: wasResolved ? 0 : 1,
					correctCount: (isCorrect ? 1 : 0) - (wasCorrect ? 1 : 0),
				})
				newPointsByUserId.set(prior.userId, r.points)
			}
		}
	} else {
		const options = await tx.query.questionOptions.findMany({
			where: { questionId: question.id },
			columns: { id: true, isCorrect: true },
		})
		// Captured before the two updates below overwrite isCorrect - the only
		// record of "was this option previously marked correct" (needed for the
		// per-selection correctCount delta on an overturn re-resolve).
		const oldIsCorrectByOptionId = new Map(
			options.map((o) => [o.id, o.isCorrect]),
		)
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
			columns: {
				id: true,
				optionId: true,
				conviction: true,
				resultPoints: true,
			},
			with: { call: { columns: { id: true, userId: true, createdAt: true } } },
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
		// player_season_award/team_season_award call's picks all share the same
		// createdAt, so this ranks distinct calls, not selections, before
		// mapping back.
		const callsById = new Map(selections.map((s) => [s.call.id, s.call]))
		const orderedCalls = [...callsById.values()].sort(
			(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
		)
		let earlyMultByCallId: Map<string, number>
		if (isSeasonLongShape(question.shape)) {
			// Season-long: earliness is games-played-so-far / total games in the
			// window this question was actually open for, not rank among callers
			// - see seasonEarlyTierFor's doc comment. The window is bounded by
			// this question's own locksAt (not a fixed regular-season cutoff), so
			// it naturally includes postseason games when a creator leaves a
			// question open that far and excludes them when they don't - no
			// regular-vs-postseason branching needed here.
			const seasonGames = await tx
				.select({ startsAt: games.startsAt, status: games.status })
				.from(games)
				.where(
					and(
						eq(games.seasonId, question.seasonId),
						lte(games.startsAt, question.locksAt),
					),
				)
			const totalGames = seasonGames.length
			earlyMultByCallId = new Map(
				orderedCalls.map((c) => {
					const gamesPlayed = seasonGames.filter(
						(g) => g.status === "final" && g.startsAt <= c.createdAt,
					).length
					return [c.id, seasonEarlyTierFor(gamesPlayed, totalGames).mult]
				}),
			)
		} else {
			earlyMultByCallId = new Map(
				orderedCalls.map((c, index) => [
					c.id,
					earlyTierFor(index + 1, totalCalls).mult,
				]),
			)
		}

		for (const s of selections) {
			const pct = fieldPct(countByOption.get(s.optionId) ?? 0, totalCalls)
			const isCorrect = correctOptionIds.has(s.optionId)
			const earlyMult = earlyMultByCallId.get(s.call.id) ?? 1
			const points = selectionPoints(
				BASE_POINTS_BY_SHAPE[question.shape],
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

			const wasResolved = s.resultPoints !== null
			const wasCorrect =
				wasResolved && oldIsCorrectByOptionId.get(s.optionId) === true
			addLeagueStatDelta(statDeltas, s.call.userId, {
				points: points - (s.resultPoints ?? 0),
				resolvedCallCount: wasResolved ? 0 : 1,
				correctCount: (isCorrect ? 1 : 0) - (wasCorrect ? 1 : 0),
			})
			newPointsByUserId.set(
				s.call.userId,
				(newPointsByUserId.get(s.call.userId) ?? 0) + points,
			)
		}
	}

	await applySeasonStatDeltas(
		tx,
		question.leagueId,
		question.seasonId,
		statDeltas,
	)

	await createNotifications(
		tx,
		[...statDeltas]
			.filter(([, d]) => d.points !== 0 || d.resolvedCallCount !== 0)
			.map(([userId, d]) => ({
				type: "call_resolved" as const,
				userId,
				questionId: question.id,
				questionTitle: question.title,
				pointsDelta: newPointsByUserId.get(userId) ?? d.points,
			})),
	)

	const [updated] = await tx
		.update(questions)
		.set({
			status: "resolved",
			resolvedAt: new Date(),
			resolutionNote: data.resolutionNote || null,
			...(isNumericGuess ? { numericActualValue: data.actualValue } : {}),
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

// Called by voidQuestion for every question it voids, regardless of status -
// callCount always needs decrementing for each caller (an `open` question
// can already have calls cast on it), while points/resolvedCallCount/
// correctCount only come out non-zero when calls had already been scored,
// i.e. a `disputed` question (the only status reachable after
// resolveQuestionInternal has already run). Reads whatever's currently on
// the calls/selections before the cascade delete removes them and un-applies
// it from user_league_stats, so a voided-after-dispute question doesn't
// leave stale points/accuracy behind.
async function reverseQuestionLeagueStats(tx: Tx, question: Question) {
	const questionCalls = await tx.query.calls.findMany({
		where: { questionId: question.id },
		columns: { userId: true, resultPoints: true, hitTolerance: true },
		with: {
			selections: {
				columns: { resultPoints: true },
				with: { option: { columns: { isCorrect: true } } },
			},
		},
	})

	const deltas = new Map<string, LeagueStatDelta>()
	for (const call of questionCalls) {
		let points = 0
		let resolvedCallCount = 0
		let correctCount = 0
		if (call.selections.length > 0) {
			for (const s of call.selections) {
				if (s.resultPoints === null) continue
				points += s.resultPoints
				resolvedCallCount += 1
				if (s.option?.isCorrect) correctCount += 1
			}
		} else if (call.resultPoints !== null) {
			points += call.resultPoints
			resolvedCallCount += 1
			if (call.hitTolerance) correctCount += 1
		}
		addLeagueStatDelta(deltas, call.userId, {
			points: -points,
			resolvedCallCount: -resolvedCallCount,
			correctCount: -correctCount,
			callCount: -1,
		})
	}

	await applySeasonStatDeltas(tx, question.leagueId, question.seasonId, deltas)
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

const EditQuestionTitleInput = builder.inputType("EditQuestionTitleInput", {
	fields: (t) => ({
		questionId: t.id({ required: true }),
		title: t.string({ required: true }),
	}),
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

const DeleteQuestionInput = builder.inputType("DeleteQuestionInput", {
	fields: (t) => ({
		questionId: t.id({ required: true }),
	}),
})

const DeleteQuestionPayload = builder
	.objectRef<{ questionId: string }>("DeleteQuestionPayload")
	.implement({
		fields: (t) => ({
			questionId: t.exposeID("questionId"),
		}),
	})

const ReportQuestionInput = builder.inputType("ReportQuestionInput", {
	fields: (t) => ({
		questionId: t.id({ required: true }),
		reason: t.field({ type: VoidReason, required: true }),
		details: t.string({ required: false }),
	}),
})

const ReportQuestionPayload = builder
	.objectRef<{ report: typeof questionReports.$inferSelect }>(
		"ReportQuestionPayload",
	)
	.implement({
		fields: (t) => ({
			report: t.field({
				type: QuestionReportRef,
				resolve: (payload) => payload.report,
			}),
		}),
	})

const DismissReportInput = builder.inputType("DismissReportInput", {
	fields: (t) => ({
		reportId: t.id({ required: true }),
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
			if (!user.emailVerified) {
				throw new AuthorizationError(
					"Verify your email before posting a question.",
				)
			}
			if (!user.questionCreationEnabled) {
				throw new AuthorizationError(
					"Your question creation has been suspended. Contact support if you think this is a mistake.",
				)
			}
			const parsed = createQuestionSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}
			const data = parsed.data

			if (data.isOfficial && !user.isAdmin) {
				throw new AuthorizationError("Only admins can post official questions.")
			}
			// The create-question form only shows the ballot field to admins, but
			// that's a UI decision, not a security boundary - never trust the
			// client omitted this only because it hid the control.
			if (data.ballot && !user.isAdmin) {
				throw new AuthorizationError(
					"Only admins can add a question to a ballot.",
				)
			}

			// Official questions are attributed to the Called My Shot account
			// itself, never the admin who happened to click "post" - the byline
			// should read the same no matter which admin posted it.
			const creatorId = data.isOfficial ? await getOfficialAccountId() : user.id

			// When a game is picked, its own startsAt is what actually gets
			// stored as locksAt below - the create-question form disables that
			// field and fills it from the game client-side, but the server
			// re-derives it from the game row rather than trusting the
			// submitted string, so a stale or tampered locksAt can't desync
			// the two. homeTeam/awayTeam are loaded alongside it since
			// game_total_over_under and team_vs_team both need the real team
			// names for their generated title. Both relations are typed
			// nullable purely because drizzle types every `one` relation that
			// way regardless of the FK's own nullability (homeTeamId/
			// awayTeamId are NOT NULL) - same non-issue documented at length
			// elsewhere in this file (see resolveQuestionInternal).
			async function loadGameWithTeams(gameId: string) {
				return db.query.games.findFirst({
					where: { id: gameId },
					with: { homeTeam: true, awayTeam: true },
				})
			}
			let game: Awaited<ReturnType<typeof loadGameWithTeams>> | null = null
			let homeTeamName: string | null = null
			let awayTeamName: string | null = null
			if (data.gameId) {
				game = (await loadGameWithTeams(data.gameId)) ?? null
				if (!game) throw ValidationError.field("gameId", "Game not found")
				if (game.leagueId !== data.leagueId) {
					throw ValidationError.field(
						"gameId",
						"Game must belong to the selected league",
					)
				}
				if (!game.homeTeam || !game.awayTeam) {
					throw new Error("Game is missing its home/away team")
				}
				homeTeamName = game.homeTeam.name
				awayTeamName = game.awayTeam.name
			}

			// Resolved once up front for the structured-field validation below -
			// only the fields a given shape actually uses end up set. Includes
			// toleranceTier so the numeric_guess tolerance snapshot below can
			// read off this one fetch instead of querying stats twice.
			const [stat, subjectPlayer, subjectTeam] = await Promise.all([
				data.statId
					? db.query.stats.findFirst({
							where: { id: data.statId },
							with: { toleranceTier: true },
						})
					: null,
				data.subjectPlayerId
					? db.query.players.findFirst({ where: { id: data.subjectPlayerId } })
					: null,
				data.subjectTeamId
					? db.query.teams.findFirst({ where: { id: data.subjectTeamId } })
					: null,
			])

			// player_season_award/team_season_award only - the pool is always
			// fully determined by leagueId (+ these optional scoping fields), so
			// the server derives its own authoritative copy here rather than
			// trusting whatever data.options the client happened to submit (which
			// the create-question form only ever builds for the live preview -
			// see PoolSummary on the frontend). Fetched here, alongside the other
			// pre-transaction lookups, so it can both drive the structural
			// validation below and be inserted as-is inside the transaction. See
			// lib/award-pool.ts for the shared query logic (also used by
			// player_game_stat_leader below and by the recurring season-question
			// engine).
			const awardPlayerPool =
				data.shape === "player_season_award"
					? await buildPlayerPool(
							{ leagueId: data.leagueId },
							{
								conferences: data.awardConferences,
								divisions: data.awardDivisions,
								positions: data.awardPositions,
								seasonsInLeague: data.awardSeasonsInLeague,
								rookieOnly: data.awardRookieOnly,
							},
						)
					: null
			const awardTeamPool =
				data.shape === "team_season_award"
					? await buildTeamPool(
							{ leagueId: data.leagueId },
							{ conferences: data.awardConferences, divisions: data.awardDivisions },
						)
					: null

			// player_game_stat_leader only - pool is just the active rosters of
			// the two teams in the picked game, not the whole league (that's the
			// whole point of this shape vs. player_season_award). gameId is
			// validated to exist below (requireStatAppliesTo/gameId checks in the
			// structural-validation match) - here it's read optimistically since
			// `game` may not be loaded yet the first time this runs if gameId is
			// missing, in which case the pool is simply empty and the validation
			// match below rejects it.
			const gameLeaderPool =
				data.shape === "player_game_stat_leader" && game
					? await buildPlayerPool({ teamIds: [game.homeTeamId, game.awayTeamId] })
					: null

			// The tolerance band comes from the stat's own tolerance tier, not
			// the creator - createQuestionSchema guarantees statId is set (no
			// customStat fallback) for these two shapes specifically, so a
			// creator can't set an unhittable or trivial-to-hit band by hand.
			// Which column gets set depends on the tier's mode - see
			// ToleranceSpec in @called-my-shot/scoring.
			let numericTolerancePct: number | null = null
			let numericToleranceAbsolute: number | null = null
			if (
				data.shape === "player_stat_numeric_guess" ||
				data.shape === "team_stat_numeric_guess" ||
				data.shape === "team_season_stat_numeric_guess"
			) {
				if (!stat?.toleranceTier) {
					throw ValidationError.field("statId", "Pick a stat from the list")
				}
				if (stat.toleranceTier.toleranceMode === "absolute") {
					numericToleranceAbsolute = stat.toleranceTier.toleranceValue
				} else {
					numericTolerancePct = stat.toleranceTier.toleranceValue
				}
			}

			// Only meaningful for a catalog stat - a freeform customStat (over_under
			// and player_vs_player both allow one, see requireStat vs
			// requireCatalogStat in the shared schema) has no appliesTo to check
			// against, so it's left alone rather than rejected.
			function requireStatAppliesTo(kind: "player" | "team") {
				if (stat && stat.appliesTo !== "both" && stat.appliesTo !== kind) {
					throw ValidationError.field(
						"statId",
						`"${stat.name}" isn't tracked as a ${kind} stat`,
					)
				}
			}

			// Title itself is always data.title now (required - see title on
			// createQuestionSchema); this match is pure structured-field
			// validation, not title generation. generateQuestionTitle is what
			// the create-question form uses client-side to prefill that field, so
			// the two can't drift, but the server no longer needs its own copy of
			// the generated string.
			match(data.shape)
				.with("player_stat_over_under", () => {
					if (!subjectPlayer) {
						throw ValidationError.field("subjectPlayerId", "Player not found")
					}
					if (!data.gameId) {
						throw ValidationError.field("gameId", "Pick a game")
					}
					if (data.ouLine === undefined) {
						throw ValidationError.field("ouLine", "Set the line")
					}
					requireStatAppliesTo("player")
				})
				.with("team_stat_over_under", () => {
					if (!subjectTeam) {
						throw ValidationError.field("subjectTeamId", "Team not found")
					}
					if (!data.gameId) {
						throw ValidationError.field("gameId", "Pick a game")
					}
					if (data.ouLine === undefined) {
						throw ValidationError.field("ouLine", "Set the line")
					}
					requireStatAppliesTo("team")
				})
				.with("player_season_stat_over_under", () => {
					if (!subjectPlayer) {
						throw ValidationError.field("subjectPlayerId", "Player not found")
					}
					if (data.ouLine === undefined) {
						throw ValidationError.field("ouLine", "Set the line")
					}
					if (!data.statAggregation) {
						throw ValidationError.field(
							"statAggregation",
							"Say whether that's a total or a per-game average",
						)
					}
					requireStatAppliesTo("player")
				})
				.with("team_season_stat_over_under", () => {
					if (!subjectTeam) {
						throw ValidationError.field("subjectTeamId", "Team not found")
					}
					if (data.ouLine === undefined) {
						throw ValidationError.field("ouLine", "Set the line")
					}
					if (!data.statAggregation) {
						throw ValidationError.field(
							"statAggregation",
							"Say whether that's a total or a per-game average",
						)
					}
					requireStatAppliesTo("team")
				})
				.with("game_total_over_under", () => {
					if (!homeTeamName || !awayTeamName) {
						throw ValidationError.field("gameId", "Pick a game")
					}
					if (data.ouLine === undefined) {
						throw ValidationError.field("ouLine", "Set the line")
					}
					// A game-wide total is never about one specific player, same
					// subject kind as a team stat for this check's purposes.
					requireStatAppliesTo("team")
				})
				.with("player_stat_numeric_guess", () => {
					if (!subjectPlayer) {
						throw ValidationError.field("subjectPlayerId", "Player not found")
					}
					if (!data.gameId) {
						throw ValidationError.field("gameId", "Pick a game")
					}
					requireStatAppliesTo("player")
				})
				.with("team_stat_numeric_guess", () => {
					if (!subjectTeam) {
						throw ValidationError.field("subjectTeamId", "Team not found")
					}
					if (!data.gameId) {
						throw ValidationError.field("gameId", "Pick a game")
					}
					requireStatAppliesTo("team")
				})
				.with("team_season_stat_numeric_guess", () => {
					if (!subjectTeam) {
						throw ValidationError.field("subjectTeamId", "Team not found")
					}
					requireStatAppliesTo("team")
				})
				.with("player_vs_player", () => {
					const [a, b] = data.options ?? []
					if (!a?.label || !b?.label) {
						throw ValidationError.field("options", "Pick two players")
					}
					if (!data.gameId) {
						throw ValidationError.field("gameId", "Pick a game")
					}
					requireStatAppliesTo("player")
				})
				.with("player_vs_player_season", () => {
					const [a, b] = data.options ?? []
					if (!a?.label || !b?.label) {
						throw ValidationError.field("options", "Pick two players")
					}
					if (!data.statAggregation) {
						throw ValidationError.field(
							"statAggregation",
							"Say whether that's a total or a per-game average",
						)
					}
					requireStatAppliesTo("player")
				})
				.with("team_vs_team", () => {
					if (!homeTeamName || !awayTeamName) {
						throw ValidationError.field("gameId", "Pick a game")
					}
				})
				// yes_no_prop and player_award_finalists have nothing left to check
				// here - createQuestionSchema's own superRefine (requireAwardName,
				// the eventClause check) already guarantees their required fields
				// by the time data exists.
				.with("yes_no_prop", () => {})
				.with("player_season_award", () => {
					if (
						!awardPlayerPool ||
						awardPlayerPool.length < (data.picksRequired ?? 1)
					) {
						throw ValidationError.field(
							"awardConferences",
							"No players match that conference/division/position - check the values",
						)
					}
				})
				.with("team_season_award", () => {
					if (
						!awardTeamPool ||
						awardTeamPool.length < (data.picksRequired ?? 1)
					) {
						throw ValidationError.field(
							"awardConferences",
							"No teams match that conference/division - check the values",
						)
					}
				})
				.with("player_award_finalists", () => {})
				.with("player_game_stat_leader", () => {
					if (!game || !homeTeamName || !awayTeamName) {
						throw ValidationError.field("gameId", "Pick a game")
					}
					requireStatAppliesTo("player")
					if (!gameLeaderPool || gameLeaderPool.length < 2) {
						throw ValidationError.field(
							"statId",
							"Not enough players on either roster for this game yet",
						)
					}
				})
				.exhaustive()

			// Loaded up front (same spot as the game/stat/award-pool lookups
			// above) so a bad ballot placement fails before the transaction opens,
			// not partway through it.
			const ballot = data.ballot
				? await db.query.ballots.findFirst({
						where: { id: data.ballot.ballotId },
					})
				: null
			if (data.ballot) {
				if (!ballot) {
					throw ValidationError.field("ballot", "Ballot not found")
				}
				if (ballot.leagueId !== data.leagueId) {
					throw ValidationError.field(
						"ballot",
						"Question must be in the same league as the ballot",
					)
				}
			}

			const title = data.title

			// Game-scoped: copied straight off the picked game. Game-less: the
			// league's current season at creation time. Never client-supplied -
			// there's no seasonId field in createQuestionSchema. questions.seasonId
			// is NOT NULL, so a league with nothing synced yet can't have
			// questions created against it at all - that's a real "this league
			// isn't ready" state, not something to paper over with a null.
			const seasonId =
				game?.seasonId ?? (await getCurrentSeason(data.leagueId))?.id
			if (!seasonId) {
				throw ValidationError.field(
					"leagueId",
					"This league isn't set up yet - no season data has synced for it.",
				)
			}

			const question = await db.transaction(async (tx) => {
				const [question] = await tx
					.insert(questions)
					.values({
						shape: data.shape,
						title,
						creatorId,
						isOfficial: data.isOfficial ?? false,
						sportId: data.sportId,
						leagueId: data.leagueId,
						gameId: data.gameId ?? null,
						seasonId,
						resolutionSource: data.resolutionSource,
						resolutionSourceUrl: data.resolutionSourceUrl || null,
						locksAt: game?.startsAt ?? new Date(data.locksAt),
						statId: data.statId ?? null,
						customStat: data.customStat || null,
						ouLine: data.ouLine ?? null,
						statAggregation: data.statAggregation ?? null,
						subjectTeamId: data.subjectTeamId ?? null,
						subjectPlayerId: data.subjectPlayerId ?? null,
						numericTolerancePct,
						numericToleranceAbsolute,
						picksRequired: data.picksRequired ?? null,
						eventClause: data.eventClause || null,
						awardName: data.awardName || null,
						awardVerb: data.awardVerb ?? null,
						awardConferences: data.awardConferences?.length
							? data.awardConferences
							: null,
						awardDivisions: data.awardDivisions?.length
							? data.awardDivisions
							: null,
						awardPositions: data.awardPositions?.length
							? data.awardPositions
							: null,
						awardSeasonsInLeague: data.awardSeasonsInLeague?.length
							? data.awardSeasonsInLeague
							: null,
						awardRookieOnly: data.awardRookieOnly || null,
					})
					.returning()

				await match(data.shape)
					.with(
						"player_vs_player",
						"player_vs_player_season",
						"player_award_finalists",
						async () => {
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
						},
					)
					.with("player_season_award", async () => {
						await tx.insert(questionOptions).values(
							(awardPlayerPool ?? []).map((player, index) => ({
								questionId: question.id,
								label: player.name,
								sortOrder: index,
								playerId: player.id,
							})),
						)
					})
					.with("team_season_award", async () => {
						await tx.insert(questionOptions).values(
							(awardTeamPool ?? []).map((team, index) => ({
								questionId: question.id,
								label: team.name,
								sortOrder: index,
								teamId: team.id,
							})),
						)
					})
					.with("player_game_stat_leader", async () => {
						await tx.insert(questionOptions).values(
							(gameLeaderPool ?? []).map((player, index) => ({
								questionId: question.id,
								label: player.name,
								sortOrder: index,
								playerId: player.id,
							})),
						)
					})
					.with("yes_no_prop", async () => {
						await tx.insert(questionOptions).values([
							{ questionId: question.id, label: "Yes", sortOrder: 0 },
							{ questionId: question.id, label: "No", sortOrder: 1 },
						])
					})
					.with(
						"player_stat_over_under",
						"team_stat_over_under",
						"player_season_stat_over_under",
						"team_season_stat_over_under",
						"game_total_over_under",
						async () => {
							// Bare "Over"/"Under" - the line itself isn't part of the
							// stored label, it's appended for display by
							// optionDisplayLabel (web) wherever an over/under option
							// renders, same as "Yes"/"No" above needs no line at all.
							// Baking ouLine in here too would double it up on every
							// render.
							await tx.insert(questionOptions).values([
								{
									questionId: question.id,
									label: "Over",
									sortOrder: 0,
								},
								{
									questionId: question.id,
									label: "Under",
									sortOrder: 1,
								},
							])
						},
					)
					.with("team_vs_team", async () => {
						if (!game || !homeTeamName || !awayTeamName) {
							throw ValidationError.field("gameId", "Pick a game")
						}
						await tx.insert(questionOptions).values([
							{
								questionId: question.id,
								label: awayTeamName,
								sortOrder: 0,
								teamId: game.awayTeamId,
							},
							{
								questionId: question.id,
								label: homeTeamName,
								sortOrder: 1,
								teamId: game.homeTeamId,
							},
						])
					})
					.with(
						"player_stat_numeric_guess",
						"team_stat_numeric_guess",
						"team_season_stat_numeric_guess",
						async () => {
							// No options row - scored via calls.guessValue directly.
						},
					)
					.exhaustive()

				if (data.ballot) {
					const [{ maxSortOrder }] = await tx
						.select({
							maxSortOrder: sql<number>`coalesce(max(${ballotQuestions.sortOrder}), -1)`,
						})
						.from(ballotQuestions)
						.where(eq(ballotQuestions.ballotId, data.ballot.ballotId))
					await tx.insert(ballotQuestions).values({
						ballotId: data.ballot.ballotId,
						questionId: question.id,
						label: data.ballot.label,
						slot: data.ballot.slot ?? null,
						sortOrder: maxSortOrder + 1,
					})
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
				shape: question.shape,
			})
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}
			const data = parsed.data

			if (
				(data.shape === "player_season_award" ||
					data.shape === "team_season_award") &&
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

			const call = await db.transaction(async (tx) => {
				const isNumericGuess =
					data.shape === "player_stat_numeric_guess" ||
					data.shape === "team_stat_numeric_guess" ||
					data.shape === "team_season_stat_numeric_guess"

				const [call] = await tx
					.insert(calls)
					.values({
						questionId: question.id,
						userId: user.id,
						caseText: data.caseText || null,
						guessValue: isNumericGuess ? (data.guessValue ?? null) : null,
						conviction: isNumericGuess ? (data.conviction ?? null) : null,
					})
					.returning()

				if (data.selections.length > 0) {
					await tx.insert(callSelections).values(
						data.selections.map((s) => ({
							callId: call.id,
							optionId: s.optionId,
							conviction: s.conviction,
						})),
					)
				}

				await applySeasonStatDeltas(
					tx,
					question.leagueId,
					question.seasonId,
					new Map([
						[
							user.id,
							{
								points: 0,
								resolvedCallCount: 0,
								correctCount: 0,
								callCount: 1,
							},
						],
					]),
				)

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
					shape: question.shape,
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
					shape: question.shape,
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
					shape: question.shape,
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

				await createNotification(tx, {
					type: "dispute_overturned",
					userId: dispute.userId,
					questionId: question.id,
					questionTitle: question.title,
					disputeId: dispute.id,
				})

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

				const question = await tx.query.questions.findFirst({
					where: { id: dispute.questionId },
					columns: { title: true },
				})
				if (!question)
					throw new Error("upholdDispute: question vanished mid-transaction")

				await createNotification(tx, {
					type: "dispute_upheld",
					userId: dispute.userId,
					questionId: dispute.questionId,
					questionTitle: question.title,
					disputeId: dispute.id,
				})

				return updatedDispute
			})
		},
	}),

	// Dismiss = admin looked at the report and decided the question is fine as
	// is. Doesn't touch the question itself - if it actually needs to come
	// down, that's a separate Void action (same escalation path the Disputes
	// page already offers), not something this mutation does on its own.
	dismissReport: t.field({
		type: QuestionReportRef,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "DismissReportResult" },
		},
		args: { input: t.arg({ type: DismissReportInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)

			return db.transaction(async (tx) => {
				const [report] = await tx
					.select()
					.from(questionReports)
					.where(eq(questionReports.id, args.input.reportId))
					.for("update")
				if (!report) throw new NotFoundError("Report not found")
				if (report.status !== "open") {
					throw ValidationError.field(null, "This report is already settled.")
				}

				const [updatedReport] = await tx
					.update(questionReports)
					.set({ status: "dismissed", reviewedAt: new Date() })
					.where(eq(questionReports.id, report.id))
					.returning()
				if (!updatedReport)
					throw new Error("dismissReport: report vanished mid-transaction")

				return updatedReport
			})
		},
	}),

	// title is always creator-supplied free text (generateQuestionTitle only
	// prefills a suggestion client-side - see the comment on title in
	// createQuestionSchema) - this just lets an admin fix a typo or awkward
	// wording after the fact, without having to void and recreate the whole
	// question.
	editQuestionTitle: t.field({
		type: QuestionPayload,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "EditQuestionTitleResult" },
		},
		args: { input: t.arg({ type: EditQuestionTitleInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = editQuestionTitleSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const { questionId, title } = parsed.data

			const [updated] = await db
				.update(questions)
				.set({ title })
				.where(eq(questions.id, questionId))
				.returning()
			if (!updated) throw new NotFoundError("Question not found")
			return { question: updated }
		},
	}),

	// Official-only counterpart to voidQuestion - a user-generated question
	// always goes through Void instead, since that's what preserves the audit
	// trail and strike bookkeeping a real asker's question needs (see
	// questionVoids and the comment above voidQuestion below). An official
	// question has no asker to strike and no dispute-worthy audit trail, so a
	// hard delete is the right tool when one was posted in error (wrong game,
	// duplicate sync, bad award setup).
	deleteQuestion: t.field({
		type: DeleteQuestionPayload,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "DeleteQuestionResult" },
		},
		args: { input: t.arg({ type: DeleteQuestionInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = deleteQuestionSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const { questionId } = parsed.data

			await db.transaction(async (tx) => {
				const [question] = await tx
					.select()
					.from(questions)
					.where(eq(questions.id, questionId))
					.for("update")
				if (!question) throw new NotFoundError("Question not found")
				if (!question.isOfficial) {
					throw ValidationError.field(
						null,
						"Only official questions can be deleted this way - void a user-generated question instead.",
					)
				}

				await reverseQuestionLeagueStats(tx, question)
				await tx.delete(questions).where(eq(questions.id, question.id))
			})

			return { questionId }
		},
	}),

	// Void = delete the question and everything on it (calls, options,
	// disputes all cascade). reverseQuestionLeagueStats always runs first -
	// callCount needs decrementing for every caller even on an open question
	// (calls can already exist pre-resolution), while points/resolvedCallCount/
	// correctCount only come out non-zero for a disputed question (the only
	// status that already went through resolveQuestionInternal once) - before
	// the cascade delete removes the only rows that recorded any of it.
	// questionVoids keeps the audit trail (Users tab's void history, and the
	// strike bookkeeping below) that the hard delete would otherwise erase.
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

					let strikeCount: number | undefined
					if (data.countsAsStrike) {
						const [updatedUser] = await tx
							.update(users)
							.set({ strikeCount: sql`${users.strikeCount} + 1` })
							.where(eq(users.id, question.creatorId))
							.returning()
						if (updatedUser) {
							strikeCount = updatedUser.strikeCount
							if (
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

					await createNotification(tx, {
						type: "question_voided",
						userId: question.creatorId,
						questionId: question.id,
						questionTitle: question.title,
						strikeCount,
					})
				}

				await reverseQuestionLeagueStats(tx, question)

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

			const settledDispute = await db.query.resolutionDisputes.findFirst({
				where: {
					questionId: data.questionId,
					status: { in: ["upheld", "overturned"] },
				},
			})
			if (settledDispute) {
				throw ValidationError.field(
					null,
					"This question's resolution has already been reviewed and is final.",
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

				if (question.creatorId && question.creatorId !== user.id) {
					await createNotification(tx, {
						type: "dispute_filed",
						userId: question.creatorId,
						questionId: question.id,
						questionTitle: question.title,
						actorId: user.id,
						actorUsername: user.username,
						disputeId: dispute.id,
					})
				}

				return dispute
			})

			return { dispute }
		},
	}),

	// Distinct from fileDispute above: a report flags the question itself as
	// bad (nonsensical, off-topic, a duplicate, ...), not a resolution as
	// wrong, so it's open to any signed-in caller regardless of question
	// status, not just resolved ones a viewer actually called on.
	reportQuestion: t.field({
		type: ReportQuestionPayload,
		errors: {
			types: [AuthenticationError, NotFoundError, ValidationError],
			directResult: true,
			union: { name: "ReportQuestionResult" },
		},
		args: { input: t.arg({ type: ReportQuestionInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const parsed = reportQuestionSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}
			const data = parsed.data

			const question = await db.query.questions.findFirst({
				where: { id: data.questionId },
			})
			if (!question) throw new NotFoundError("Question not found")

			const existingReport = await db.query.questionReports.findFirst({
				where: {
					questionId: data.questionId,
					reportedByUserId: user.id,
				},
			})
			if (existingReport) {
				throw ValidationError.field(
					null,
					"You've already reported this question.",
				)
			}

			const [report] = await db
				.insert(questionReports)
				.values({
					questionId: data.questionId,
					reportedByUserId: user.id,
					reason: data.reason,
					details: data.details || null,
					status: "open",
				})
				.returning()
			if (!report) throw new Error("reportQuestion: insert returned no row")

			return { report }
		},
	}),
}))
