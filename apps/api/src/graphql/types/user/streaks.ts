import {
	STREAK_FAMILY_LABEL,
	STREAK_MILESTONE_STEP,
} from "@called-my-shot/scoring"
import { and, eq, inArray, like, sum } from "drizzle-orm"
import { db } from "../../../db"
import {
	callSelections,
	pointAwards,
	type UserStreak,
	type UserSweep,
} from "../../../db/schema"
import { pointAwardScope } from "../../../lib/point-awards"
import {
	loadColdRunCalls,
	loadRunCalls,
	loadSweepCalls,
} from "../../../lib/streaks/read"
import { formatSlateLabel, parseSlateKey } from "../../../lib/streaks/slate"
import { builder } from "../../builder"
import type { Context } from "../../context"
import { CallRef } from "../question"
import { findLeague, LeagueRef } from "../sports"
import { StreakFamilyEnum } from "./enums"

async function leagueOf(
	row: { leagueId: string },
	_args: unknown,
	ctx: Context,
) {
	const league = await findLeague(ctx, { id: row.leagueId })
	if (!league) throw new Error(`league ${row.leagueId} not found`)
	return league
}

// The milestone bonuses one run has paid so far - every STREAK_BONUS_STEP
// wins, see streakAwards in lib/streaks/compute.ts. Each award's sourceKey
// leads with its run's first call, which is the run's start here too.
async function runBonus(
	streak: UserStreak,
	startCallId: string | null,
): Promise<number> {
	if (!startCallId) return 0
	const [row] = await db
		.select({ points: sum(pointAwards.points).mapWith(Number) })
		.from(pointAwards)
		.where(
			and(
				eq(pointAwards.kind, "streak_milestone"),
				eq(
					pointAwards.scopeKey,
					pointAwardScope.streak(streak.userId, streak.leagueId, streak.family),
				),
				like(pointAwards.sourceKey, `${startCallId}:%`),
			),
		)
	return row?.points ?? 0
}

// One league-and-family track for one user - see user_streaks in
// db/schema/streaks.ts.
export const UserStreakRef = builder
	.objectRef<UserStreak>("UserStreak")
	.implement({
		fields: (t) => ({
			league: t.field({ type: LeagueRef, resolve: leagueOf }),
			family: t.field({ type: StreakFamilyEnum, resolve: (s) => s.family }),
			familyLabel: t.field({
				type: "String",
				resolve: (s) => STREAK_FAMILY_LABEL[s.family],
			}),
			// Zero when the newest counted call on the track missed.
			currentLength: t.exposeInt("currentLength"),
			bestLength: t.exposeInt("bestLength"),
			// The cold streak: the same two numbers for runs of misses. Zero when
			// the newest counted call on the track hit, so one side or the other
			// is always zero.
			currentColdLength: t.exposeInt("currentColdLength"),
			worstColdLength: t.exposeInt("worstColdLength"),
			worstColdEndedAt: t.field({
				type: "DateTime",
				nullable: true,
				resolve: (s) => s.worstColdEndedAt,
			}),
			// The next multiple of STREAK_MILESTONE_STEP the current run can
			// reach - what a "one more for 10" nudge counts toward.
			nextMilestone: t.field({
				type: "Int",
				resolve: (s) =>
					(Math.floor(s.currentLength / STREAK_MILESTONE_STEP) + 1) *
					STREAK_MILESTONE_STEP,
			}),
			currentStartedAt: t.field({
				type: "DateTime",
				nullable: true,
				resolve: async (s) => {
					const [first] = await loadRunCalls(
						s,
						s.currentStartCallId,
						s.currentStartCallId,
					)
					return first?.createdAt ?? null
				},
			}),
			bestEndedAt: t.field({
				type: "DateTime",
				nullable: true,
				resolve: (s) => s.bestEndedAt,
			}),
			// Whether the best run is the one still going.
			bestIsCurrent: t.field({
				type: "Boolean",
				resolve: (s) =>
					s.currentLength > 0 && s.bestStartCallId === s.currentStartCallId,
			}),
			currentRunCalls: t.field({
				type: [CallRef],
				resolve: (s) =>
					loadRunCalls(s, s.currentStartCallId, s.currentEndCallId),
			}),
			bestRunCalls: t.field({
				type: [CallRef],
				resolve: (s) => loadRunCalls(s, s.bestStartCallId, s.bestEndCallId),
			}),
			// Streak bonus points each run has earned, on top of its calls' own.
			// Zero for a run that hasn't reached its first milestone. A broken
			// run keeps what it paid.
			currentRunBonus: t.int({
				resolve: (s) =>
					s.currentLength > 0 ? runBonus(s, s.currentStartCallId) : 0,
			}),
			bestRunBonus: t.int({
				resolve: (s) => runBonus(s, s.bestStartCallId),
			}),
			// Whether the worst cold run is the one still going.
			worstColdIsCurrent: t.field({
				type: "Boolean",
				resolve: (s) =>
					s.currentColdLength > 0 &&
					s.worstColdStartCallId === s.currentColdStartCallId,
			}),
			coldStartedAt: t.field({
				type: "DateTime",
				nullable: true,
				resolve: async (s) => {
					const [first] = await loadColdRunCalls(
						s,
						s.currentColdStartCallId,
						s.currentColdStartCallId,
					)
					return first?.createdAt ?? null
				},
			}),
			coldRunCalls: t.field({
				type: [CallRef],
				resolve: (s) =>
					loadColdRunCalls(s, s.currentColdStartCallId, s.currentColdEndCallId),
			}),
			worstColdRunCalls: t.field({
				type: [CallRef],
				resolve: (s) =>
					loadColdRunCalls(s, s.worstColdStartCallId, s.worstColdEndCallId),
			}),
		}),
	})

// One slate a user picked every winner of - see user_sweeps in
// db/schema/streaks.ts.
export const UserSweepRef = builder
	.objectRef<UserSweep>("UserSweep")
	.implement({
		fields: (t) => ({
			league: t.field({ type: LeagueRef, resolve: leagueOf }),
			slateKey: t.exposeString("slateKey"),
			// "Week 3 Sunday Early", "Sep 14" - reads after the league's
			// abbreviation.
			slateLabel: t.field({
				type: "String",
				resolve: async (s, _args, ctx) => {
					const league = await leagueOf(s, null, ctx)
					const slate = parseSlateKey(s.slateKey)
					return slate ? formatSlateLabel(slate, league.slug) : s.slateKey
				},
			}),
			gameCount: t.exposeInt("gameCount"),
			firstStartsAt: t.field({
				type: "DateTime",
				resolve: (s) => s.firstStartsAt,
			}),
			settledAt: t.field({
				type: "DateTime",
				resolve: (s) => s.settledAt,
			}),
			calls: t.field({ type: [CallRef], resolve: loadSweepCalls }),
			// The sweep's own award, on top of its calls' points - see
			// sweepAwardPoints in lib/streaks/compute.ts.
			bonus: t.int({
				resolve: async (s) => {
					const award = await db.query.pointAwards.findFirst({
						where: {
							kind: "sweep",
							scopeKey: pointAwardScope.slate(s.leagueId, s.slateKey),
							sourceKey: s.userId,
						},
						columns: { points: true },
					})
					return award?.points ?? 0
				},
			}),
			// Sum of the swept calls' points, once every one of them is final.
			points: t.field({
				type: "Int",
				nullable: true,
				resolve: async (s) => {
					const sweepCalls = await loadSweepCalls(s)
					if (sweepCalls.length === 0) return null
					const selections = await db
						.select({ resultPoints: callSelections.resultPoints })
						.from(callSelections)
						.where(
							inArray(
								callSelections.callId,
								sweepCalls.map((c) => c.id),
							),
						)
					if (selections.some((row) => row.resultPoints === null)) return null
					return selections.reduce(
						(sum, row) => sum + (row.resultPoints ?? 0),
						0,
					)
				},
			}),
		}),
	})
