import {
	BASE_POINTS_BY_SHAPE,
	earlyTierFor,
	effectiveLossRate,
	fieldPct,
	isNumericGuessShape,
	isSeasonLongShape,
	previewNumericPoints,
	previewSelectionPoints,
	STREAK_FAMILY_LABEL,
	seasonEarlyTierFor,
} from "@called-my-shot/scoring"
import type { Call } from "../../../db/schema"
import { builder } from "../../builder"
import type { Context } from "../../context"
import { type Connection, PageInfoRef } from "../pagination"
import { StreakFamilyEnum } from "../user/enums"
import { CallUnscoredReason } from "./enums"
import {
	type CallStreakMark,
	callerLeagueAccuracyLoader,
	callRankLoader,
	callRedoLoader,
	callRedoSelectionsLoader,
	callSelectionsLoader,
	callStreakLoader,
	loadQuestionFacts,
	loadSeasonWindow,
	optionSelectionCountLoader,
	questionCallCountLoader,
	questionOptionCountLoader,
	questionOptionLoader,
} from "./loaders"

// How far into a streak a call was when it landed - see Call.streak.
const CallStreakMarkRef = builder
	.objectRef<CallStreakMark>("CallStreakMark")
	.implement({
		fields: (t) => ({
			length: t.exposeInt("length"),
			family: t.field({ type: StreakFamilyEnum, resolve: (m) => m.family }),
			familyLabel: t.field({
				type: "String",
				resolve: (m) => STREAK_FAMILY_LABEL[m.family],
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

// A call's season window is its question's, with games counted as played
// only if they were final by the time the call was made.
async function callSeasonWindow(ctx: Context, call: Call) {
	const question = await loadQuestionFacts(ctx, call.questionId)
	if (!question) return null
	return loadSeasonWindow(ctx, question, call.createdAt)
}

type CallPayout = { winLow: number; winHigh: number; lose: number }

// winLow and winHigh match on an option pick. A numeric guess's win depends
// on how close the rest of the field lands, so it's a range until it settles.
const CallPayoutRef = builder.objectRef<CallPayout>("CallPayout").implement({
	fields: (t) => ({
		winLow: t.exposeInt("winLow"),
		winHigh: t.exposeInt("winHigh"),
		lose: t.exposeInt("lose"),
	}),
})

async function pendingPayout(
	ctx: Context,
	call: Call,
): Promise<CallPayout | null> {
	const question = await loadQuestionFacts(ctx, call.questionId)
	if (!question) return null
	if (question.status !== "open" && question.status !== "locked") return null
	const basePoints = BASE_POINTS_BY_SHAPE[question.shape]
	const [rank, callCount] = await Promise.all([
		callRankLoader(ctx).load(call.id),
		questionCallCountLoader(ctx).load(call.questionId),
	])

	if (isNumericGuessShape(question.shape)) {
		if (call.conviction === null) return null
		const preview = previewNumericPoints(
			basePoints,
			question.lossRate,
			call.conviction,
			rank,
			callCount,
		)
		return {
			winLow: preview.winLow,
			winHigh: preview.winHigh,
			lose: preview.lose,
		}
	}

	const [selection, ...rest] = await callSelectionsLoader(ctx).load(call.id)
	if (!selection || rest.length > 0 || callCount === 0) return null
	const [option, optionCalls, optionCount, window] = await Promise.all([
		questionOptionLoader(ctx).load(selection.optionId),
		optionSelectionCountLoader(ctx).load(selection.optionId),
		questionOptionCountLoader(ctx).load(call.questionId),
		isSeasonLongShape(question.shape)
			? callSeasonWindow(ctx, call)
			: Promise.resolve(null),
	])
	const preview = previewSelectionPoints(
		basePoints,
		effectiveLossRate(question.lossRate, option?.lossRate),
		fieldPct(optionCalls, callCount),
		optionCount,
		selection.conviction,
		window
			? seasonEarlyTierFor(window.played, window.total)
			: earlyTierFor(rank, callCount),
	)
	return { winLow: preview.win, winHigh: preview.win, lose: preview.lose }
}

// What a call said before its one redo. Its presence is what the REDO badge
// reads; its contents are the before/after on the call's own page.
export const CallRedoSelectionRef = builder.drizzleObject(
	"callRedoSelections",
	{
		name: "CallRedoSelection",
		fields: (t) => ({
			id: t.exposeID("id"),
			conviction: t.exposeInt("conviction"),
			option: t.relation("option"),
		}),
	},
)

export const CallRedoRef = builder.drizzleObject("callRedos", {
	name: "CallRedo",
	fields: (t) => ({
		id: t.exposeID("id"),
		// When the redo happened, which is also the call's current createdAt.
		redoneAt: t.field({ type: "DateTime", resolve: (r) => r.redoneAt }),
		// When the original call was made. The call's createdAt no longer says
		// this - a redo re-stamps it, which is the cost - so the page states
		// both rather than quietly showing the later one.
		originalCreatedAt: t.field({
			type: "DateTime",
			resolve: (r) => r.originalCreatedAt,
		}),
		originalGuessValue: t.exposeFloat("originalGuessValue", {
			nullable: true,
		}),
		originalConviction: t.exposeInt("originalConviction", { nullable: true }),
		originalCaseText: t.exposeString("originalCaseText", { nullable: true }),
		originalSelections: t.field({
			type: [CallRedoSelectionRef],
			resolve: (redo, _args, ctx) =>
				callRedoSelectionsLoader(ctx).load(redo.id),
		}),
	}),
})

export const CallRef = builder.drizzleObject("calls", {
	name: "Call",
	fields: (t) => ({
		id: t.exposeID("id"),
		// Every pick is public to every viewer, signed in or not, whether or not
		// the question is still taking calls.
		caseText: t.exposeString("caseText", { nullable: true }),
		// numeric_guess only - everything else scores through selections
		guessValue: t.exposeFloat("guessValue", { nullable: true }),
		conviction: t.exposeInt("conviction", { nullable: true }),
		hitTolerance: t.exposeBoolean("hitTolerance", { nullable: true }),
		// numeric_guess only - the actual closeness multiplier (see
		// numericGuessPoints/TIER_MIN_MULT/TIER_MAX_MULT in
		// @called-my-shot/scoring) applied at resolution, from closenessMult
		// on the calls table. Null until resolved, and null forever on a miss.
		closenessMult: t.exposeFloat("closenessMult", { nullable: true }),
		// numeric_guess only - what % of the whole field (not just other
		// hitters) guessed at least as close to the actual value as this call
		// did, the raw share closenessMult above was derived from. Exposed
		// separately so the UI can explain the multiplier with a real number
		// ("62% of the field guessed at least this close") instead of inverting
		// the curve client-side. Same nullability as closenessMult.
		closenessFieldPct: t.exposeFloat("closenessFieldPct", { nullable: true }),
		// Why this call carries no result on a settled question - null for any
		// call that scores. See callUnscoredReason on the calls table.
		unscoredReason: t.field({
			type: CallUnscoredReason,
			nullable: true,
			resolve: (call) => call.unscoredReason,
		}),
		createdAt: t.field({
			type: "DateTime",
			resolve: (call) => call.createdAt,
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
			resolve: (call, _args, ctx) => callRankLoader(ctx).load(call.id),
		}),
		// While the question is open or locked, what this call pays if right
		// and costs if wrong, priced off the field as it stands now - the same
		// preview the caller saw while picking. Null once it settles, and for
		// an award call with several picks, which has no single pair.
		payout: t.field({
			type: CallPayoutRef,
			nullable: true,
			resolve: (call, _args, ctx) => pendingPayout(ctx, call),
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
			resolve: async (call, _args, ctx) => {
				const window = await callSeasonWindow(ctx, call)
				return window?.played ?? null
			},
		}),
		// Total games in the same window seasonGamesPlayed counts against - see
		// loadSeasonWindow for how that window is bounded.
		seasonTotalGames: t.field({
			type: "Int",
			nullable: true,
			resolve: async (call, _args, ctx) => {
				const window = await callSeasonWindow(ctx, call)
				return window?.total ?? null
			},
		}),
		user: t.relation("user"),
		question: t.relation("question"),
		// Set when this call was a win at least STREAK_TAG_MIN into its
		// league-and-family streak - the run's length as of this call.
		streak: t.field({
			type: CallStreakMarkRef,
			nullable: true,
			resolve: (call, _args, ctx) => callStreakLoader(ctx).load(call.id),
		}),
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
				const question = await loadQuestionFacts(ctx, call.questionId)
				if (!question) return null
				return callerLeagueAccuracyLoader(ctx).load(
					`${call.userId}:${question.leagueId}`,
				)
			},
		}),
		selections: t.relation("selections"),
		// Null on almost every call. Public: a redo is meant to be visible,
		// and the whole point of keeping the original is that anyone can see
		// what was abandoned.
		redo: t.field({
			type: CallRedoRef,
			nullable: true,
			resolve: (call, _args, ctx) => callRedoLoader(ctx).load(call.id),
		}),
		// Whether this call could be redone right now, ignoring the viewer's
		// wallet: they own it, the question is still open on the real clock,
		// and it hasn't already been redone.
		//
		// Deliberately excludes the balance. Balance is a property of the
		// viewer, not of the call, so folding it in would make a feed of
		// twenty cards re-derive the same wallet count twenty times - and it
		// would collapse "eligible but out of redos" (which should offer an
		// invite) into "not eligible" (which should show nothing).
		viewerCanRedo: t.field({
			type: "Boolean",
			resolve: async (call, _args, ctx) => {
				if (ctx.user?.id !== call.userId) return false
				const question = await loadQuestionFacts(ctx, call.questionId)
				if (!question) return false
				if (question.status !== "open" || question.locksAt <= new Date())
					return false
				return (await callRedoLoader(ctx).load(call.id)) === null
			},
		}),
		// Always true, and no current web code selects it. It stays in the
		// schema so a web build that still does keeps working while the api and
		// web deploys overlap; delete it once that build is no longer serving.
		viewerCanSeePick: t.field({
			type: "Boolean",
			deprecationReason: "Every pick is visible to every viewer.",
			resolve: () => true,
		}),
		// numeric_guess scores off its own resultPoints column above; every other
		// type sums across its selections. Null while any of those are pending.
		totalPoints: t.field({
			type: "Int",
			nullable: true,
			resolve: async (call, _args, ctx) => {
				if (call.resultPoints !== null) return call.resultPoints
				const selections = await callSelectionsLoader(ctx).load(call.id)
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
