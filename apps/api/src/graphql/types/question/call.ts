import { STREAK_FAMILY_LABEL } from "@called-my-shot/scoring"
import { and, count, eq, lte, sql } from "drizzle-orm"
import { db } from "../../../db"
import { type Call, calls } from "../../../db/schema"
import { builder } from "../../builder"
import type { Context } from "../../context"
import { type Connection, PageInfoRef } from "../pagination"
import { StreakFamilyEnum } from "../user/enums"
import { CallUnscoredReason } from "./enums"
import {
	type CallStreakMark,
	callerLeagueAccuracyLoader,
	callSelectionsLoader,
	callStreakLoader,
	loadQuestionFacts,
	loadSeasonWindow,
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
