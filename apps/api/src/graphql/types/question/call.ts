import { isSeasonLongShape } from "@called-my-shot/scoring"
import { and, count, eq, lte, sql } from "drizzle-orm"
import { db } from "../../../db"
import { type Call, calls, games } from "../../../db/schema"
import { canViewerSeePick } from "../../../lib/call-visibility"
import { aggregatePointsByUser } from "../../../lib/points-aggregate"
import { accuracyFrom } from "../../../lib/scoring"
import { builder } from "../../builder"
import { type Connection, PageInfoRef } from "../pagination"
import { getQuestionLeagueIdLoader } from "./loaders"

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
