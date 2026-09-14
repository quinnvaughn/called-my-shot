import {
	fieldPct,
	isNumericGuessShape,
	isSeasonLongShape,
	STREAK_FAMILY_LABEL,
	STREAK_TAG_MIN,
	streakFamilyFor,
} from "@called-my-shot/scoring"
import { and, count, eq, inArray, lte } from "drizzle-orm"
import { db } from "../../../db"
import {
	games,
	groupMembers,
	type Question,
	questionShares,
	type UserStreak,
} from "../../../db/schema"
import {
	clampPageSize,
	cursorWhere,
	decodeCursor,
	paginate,
} from "../../../lib/pagination"
import { countsTowardAchievements } from "../../../lib/streaks/enqueue"
import { builder } from "../../builder"
import { BallotQuestionRef } from "../ballot"
import { type Connection, PageInfoRef } from "../pagination"
import { StreakFamilyEnum } from "../user/enums"
import { CallConnectionRef, CallRef } from "./call"
import {
	AwardVerb,
	QuestionShape,
	QuestionStatus,
	QuestionVoidedReason,
	ResolutionMethod,
	StatAggregation,
} from "./enums"
import {
	getOptionSelectionCountLoader,
	getQuestionCallCountLoader,
	getQuestionGuessCallsLoader,
	getViewerStreakLoader,
} from "./loaders"
import { QuestionReportRef, ResolutionDisputeRef } from "./moderation-objects"

// The viewer's streak a question's result would extend or end - see
// Question.viewerStreak.
const StreakStakeRef = builder.objectRef<UserStreak>("StreakStake").implement({
	fields: (t) => ({
		family: t.field({ type: StreakFamilyEnum, resolve: (s) => s.family }),
		familyLabel: t.field({
			type: "String",
			resolve: (s) => STREAK_FAMILY_LABEL[s.family],
		}),
		currentLength: t.exposeInt("currentLength"),
		bestLength: t.exposeInt("bestLength"),
	}),
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

const GuessBucketRef = builder
	.objectRef<{ value: number; count: number }>("GuessBucket")
	.implement({
		fields: (t) => ({
			value: t.exposeFloat("value"),
			count: t.exposeInt("count"),
		}),
	})

// Shared by the top-level questions feed below and group/refs.ts's createdQuestions
// - both are lists of full Question rows, just filtered differently.
export const QuestionConnectionRef = builder
	.objectRef<Connection<Question>>("QuestionConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [QuestionRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

export const MyCallCountsRef = builder
	.objectRef<{ open: number; resolved: number }>("MyCallCounts")
	.implement({
		fields: (t) => ({
			open: t.exposeInt("open"),
			resolved: t.exposeInt("resolved"),
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
		// True when ESPN data settles the question rather than a person - see
		// resolutionMode on the questions table.
		resolvesAutomatically: t.boolean({
			resolve: (q) => q.resolutionMode === "system",
		}),
		// Who set the current result - null until there is one.
		resolutionMethod: t.field({
			type: ResolutionMethod,
			nullable: true,
			resolve: (q) => q.resolutionMethod,
		}),
		// Why a VOIDED question was voided - null for every other status.
		voidedReason: t.field({
			type: QuestionVoidedReason,
			nullable: true,
			resolve: (q) => q.voidedReason,
		}),

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
		// activity list. Same keyset-cursor shape as myCalls.
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

		// Binned guess values for the guess-distribution chart - the
		// numeric-guess shapes only (NUMERIC_GUESS_SHAPES), empty for every
		// other shape. Bin width matches the question's own tolerance band
		// (numericToleranceAbsolute when the stat is a rate stat, else a flat
		// 1) - a guess within one tolerance band of another is "close enough"
		// to group together, which generalizes correctly whether the band is a
		// whole-number counting-stat amount or a small fixed rate-stat amount
		// like +/-0.02. Rounded to 3 decimal places (matching guessValue's own
		// column scale) to avoid floating-point bucket-key drift. Same
		// "aggregate bypasses the per-caller pick-visibility gate" precedent
		// averageGuess/numericHitRatePct already establish - individual bucket
		// counts aren't attributed to any one caller.
		guessDistribution: t.field({
			type: [GuessBucketRef],
			resolve: async (question, _args, ctx) => {
				if (!isNumericGuessShape(question.shape)) return []
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

		// The viewer's run in this question's league and family, when this
		// question counts toward it and the run is at least STREAK_TAG_MIN -
		// what the pick form shows as being on the line.
		viewerStreak: t.field({
			type: StreakStakeRef,
			nullable: true,
			resolve: async (question, _args, ctx) => {
				const family = streakFamilyFor(question.shape)
				if (!ctx.user || !family || !countsTowardAchievements(question)) {
					return null
				}
				const streak = await getViewerStreakLoader(ctx, ctx.user.id).load(
					`${question.leagueId}:${family}`,
				)
				return streak && streak.currentLength >= STREAK_TAG_MIN ? streak : null
			},
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

		// Which of the viewer's OWN groups already have this question in their
		// Shared tab - drives the "Shared" state per row in the share sheet.
		// Scoped through groupMembers on purpose: a share row exists per
		// group regardless of who created it, and leaking the ids of groups
		// the viewer isn't in would say something about groups they can't see.
		// Empty (not null) when signed out, so the frontend never branches.
		viewerSharedGroupIds: t.loadableList({
			type: "ID",
			load: async (questionIds: string[], ctx) => {
				if (!ctx.user) return questionIds.map(() => [])
				const rows = await db
					.select({
						questionId: questionShares.questionId,
						groupId: questionShares.groupId,
					})
					.from(questionShares)
					.innerJoin(
						groupMembers,
						and(
							eq(groupMembers.groupId, questionShares.groupId),
							eq(groupMembers.userId, ctx.user.id),
						),
					)
					.where(inArray(questionShares.questionId, questionIds))
				const byQuestionId = new Map<string, string[]>()
				for (const row of rows) {
					const existing = byQuestionId.get(row.questionId)
					if (existing) existing.push(row.groupId)
					else byQuestionId.set(row.questionId, [row.groupId])
				}
				return questionIds.map((id) => byQuestionId.get(id) ?? [])
			},
			resolve: (question) => question.id,
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
