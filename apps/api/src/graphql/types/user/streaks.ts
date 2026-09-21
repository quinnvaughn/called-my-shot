import {
	STREAK_FAMILY_LABEL,
	STREAK_MILESTONE_STEP,
} from "@called-my-shot/scoring"
import { inArray } from "drizzle-orm"
import { db } from "../../../db"
import {
	callSelections,
	type UserStreak,
	type UserSweep,
} from "../../../db/schema"
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
