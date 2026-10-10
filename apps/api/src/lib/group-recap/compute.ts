import type { StreakFamily } from "@called-my-shot/scoring"
import { DAY_MS } from "../time"
import type {
	GroupRecapData,
	RecapCall,
	RecapMoment,
	RecapMover,
	RecapStanding,
} from "./types"

// The pure half of a recap - no database, so every rule here is testable
// without one. ./load.ts reads the rows and hands them over.

// A week with fewer members than this settling a call isn't a group week,
// it's one person's, and their own report card already covers it.
export const RECAP_MIN_ACTIVE_MEMBERS = 2

// How many candidates each slot keeps for read time to choose among (see the
// note atop ./types.ts).
export const RECAP_CANDIDATES = 5

// A lone correct call or a group miss needs a crowd: with two callers, one
// right and one wrong is just a disagreement.
export const RECAP_CROWD_MIN = 3

// A group miss is most of the callers on the same wrong pick.
const CONSENSUS_SHARE = 2 / 3

// Calling something a day ahead is ordinary. Two days out is worth a line.
export const CALLED_EARLY_MIN_DAYS = 2

export type RecapCallInput = {
	callId: string
	userId: string
	questionId: string
	leagueId: string
	outcome: "win" | "loss"
	points: number
	// The one option picked, for the shapes that pick exactly one. Null for a
	// numeric guess or a multi-pick award, which have no single side to share.
	optionId: string | null
	createdAt: Date
	locksAt: Date
	// Only for a redo that changed the pick. originalWon is whether the pick
	// it replaced would have hit.
	redo: { originalWon: boolean } | null
}

export type RecapTrackInput = {
	userId: string
	leagueId: string
	family: StreakFamily
	length: number
}

export type RecapInput = {
	// Every member's scored calls whose result landed in the week.
	calls: RecapCallInput[]
	// Fades in the week that the fader won, both sides members.
	fadeWins: { faderCallId: string; targetUserId: string }[]
	sweeps: {
		userId: string
		leagueId: string
		slateKey: string
		gameCount: number
	}[]
	// Hot runs that ended in the week.
	snaps: RecapTrackInput[]
	// Hot runs still going at the week's close.
	activeStreaks: RecapTrackInput[]
	standings: RecapStanding[]
	// The previous recap's board, or null for a group's first.
	previousStandings: RecapStanding[] | null
}

function toRecapCall(call: RecapCallInput): RecapCall {
	return {
		userId: call.userId,
		callId: call.callId,
		questionId: call.questionId,
		leagueId: call.leagueId,
		points: call.points,
	}
}

function top<T>(items: T[], compare: (a: T, b: T) => number): T[] {
	return [...items].sort(compare).slice(0, RECAP_CANDIDATES)
}

// Orders equal rows so the same rows always produce the same recap, which is
// what lets a revision tell "nothing changed" from a reshuffle. Never decides
// who gets a slot: equal best and worst calls all show (see topCalls).
const byCallId = (a: { callId: string }, b: { callId: string }) =>
	a.callId.localeCompare(b.callId)

// The candidates for best call or worst miss: RECAP_CANDIDATES deep, plus
// every call tied with the top one however many that is. A tie isn't broken,
// so read time needs all of them.
function topCalls(
	calls: RecapCallInput[],
	compare: (a: RecapCallInput, b: RecapCallInput) => number,
): RecapCall[] {
	const sorted = [...calls].sort(compare)
	const first = sorted[0]
	return sorted
		.filter((c, i) => i < RECAP_CANDIDATES || c.points === first?.points)
		.map(toRecapCall)
}

function crowdMoments(calls: RecapCallInput[]): RecapMoment[] {
	const byQuestion = new Map<string, RecapCallInput[]>()
	for (const call of calls) {
		const list = byQuestion.get(call.questionId)
		if (list) list.push(call)
		else byQuestion.set(call.questionId, [call])
	}

	const lone: (RecapMoment & { kind: "lone_correct" })[] = []
	const consensus: (RecapMoment & { kind: "consensus_miss" })[] = []
	for (const [questionId, list] of byQuestion) {
		if (list.length < RECAP_CROWD_MIN) continue
		const winners = list.filter((c) => c.outcome === "win")
		const [only] = winners
		if (winners.length === 1 && only) {
			lone.push({
				kind: "lone_correct",
				...toRecapCall(only),
				callerCount: list.length,
			})
		}

		const wrongByOption = new Map<string, number>()
		for (const call of list) {
			if (call.outcome !== "loss" || call.optionId === null) continue
			wrongByOption.set(
				call.optionId,
				(wrongByOption.get(call.optionId) ?? 0) + 1,
			)
		}
		for (const [optionId, wrongCount] of wrongByOption) {
			if (
				wrongCount >= RECAP_CROWD_MIN &&
				wrongCount >= list.length * CONSENSUS_SHARE
			) {
				const [first] = list
				if (!first) continue
				consensus.push({
					kind: "consensus_miss",
					questionId,
					leagueId: first.leagueId,
					optionId,
					wrongCount,
					callerCount: list.length,
				})
			}
		}
	}

	return [
		...top(
			lone,
			(a, b) =>
				b.callerCount - a.callerCount || b.points - a.points || byCallId(a, b),
		),
		...top(
			consensus,
			(a, b) =>
				b.wrongCount - a.wrongCount ||
				b.wrongCount / b.callerCount - a.wrongCount / a.callerCount ||
				a.questionId.localeCompare(b.questionId),
		),
	]
}

function movers(
	standings: RecapStanding[],
	previous: RecapStanding[] | null,
): RecapMover[] {
	if (!previous) return []
	const before = new Map(previous.map((s) => [s.userId, s.rank]))
	return standings.flatMap((s) => {
		const from = before.get(s.userId)
		return from !== undefined && from !== s.rank
			? [{ userId: s.userId, from, to: s.rank }]
			: []
	})
}

const byLength = (a: RecapTrackInput, b: RecapTrackInput) =>
	b.length - a.length ||
	a.userId.localeCompare(b.userId) ||
	a.leagueId.localeCompare(b.leagueId) ||
	a.family.localeCompare(b.family)

// Null when the week doesn't clear RECAP_MIN_ACTIVE_MEMBERS.
export function computeRecap(input: RecapInput): GroupRecapData | null {
	const { calls } = input
	const activeMembers = new Set(calls.map((c) => c.userId)).size
	if (activeMembers < RECAP_MIN_ACTIVE_MEMBERS) return null

	const callById = new Map(calls.map((c) => [c.callId, c]))
	const redone = calls.filter((c) => c.redo !== null)

	const moments: RecapMoment[] = [
		...top(
			input.sweeps,
			(a, b) =>
				b.gameCount - a.gameCount ||
				a.userId.localeCompare(b.userId) ||
				a.slateKey.localeCompare(b.slateKey),
		).map((s) => ({ kind: "sweep" as const, ...s })),
		...top(
			redone.filter((c) => c.outcome === "loss" && c.redo?.originalWon),
			(a, b) => a.points - b.points || byCallId(a, b),
		).map((c) => ({ kind: "redo_backfired" as const, ...toRecapCall(c) })),
		...crowdMoments(calls),
		...top(
			redone.filter((c) => c.outcome === "win" && !c.redo?.originalWon),
			(a, b) => b.points - a.points || byCallId(a, b),
		).map((c) => ({ kind: "redo_paid_off" as const, ...toRecapCall(c) })),
		...top(input.snaps, byLength).map((s) => ({
			kind: "streak_ended" as const,
			...s,
		})),
		...top(
			input.fadeWins.flatMap((fade) => {
				const call = callById.get(fade.faderCallId)
				return call && call.outcome === "win"
					? [{ ...toRecapCall(call), targetUserId: fade.targetUserId }]
					: []
			}),
			(a, b) => b.points - a.points || byCallId(a, b),
		).map((f) => ({ kind: "fade_hit" as const, ...f })),
		...top(
			calls.flatMap((c) => {
				const daysAhead = Math.floor(
					(c.locksAt.getTime() - c.createdAt.getTime()) / DAY_MS,
				)
				return c.outcome === "win" && daysAhead >= CALLED_EARLY_MIN_DAYS
					? [{ ...toRecapCall(c), daysAhead }]
					: []
			}),
			(a, b) =>
				b.daysAhead - a.daysAhead || b.points - a.points || byCallId(a, b),
		).map((c) => ({ kind: "called_early" as const, ...c })),
		...top(input.activeStreaks, byLength).map((s) => ({
			kind: "longest_streak" as const,
			...s,
		})),
	]

	return {
		record: {
			wins: calls.filter((c) => c.outcome === "win").length,
			losses: calls.filter((c) => c.outcome === "loss").length,
			activeMembers,
		},
		bestCalls: topCalls(
			calls.filter((c) => c.points > 0),
			(a, b) => b.points - a.points || byCallId(a, b),
		),
		worstMisses: topCalls(
			calls.filter((c) => c.points < 0),
			(a, b) => a.points - b.points || byCallId(a, b),
		),
		moments,
		standings: input.standings,
		movers: movers(input.standings, input.previousStandings),
	}
}
