import type { RecapCall, RecapPlayerOfTheWeek } from "../group-recap/types"
import { type RecapWeek, weeksBetween } from "../group-recap/week"

// The pure half of a group's Record Book: everything it says that comes off
// the group's recaps. ./load.ts reads them and resolves the ids.
//
// The records count members who can be named on a recap - current members
// who haven't opted out - the same set a recap's own slots draw from. The
// weekly list keeps every week's winner, named or not, since leaving a week
// blank would say nobody won it.

// How deep each record's list goes.
export const RECORD_BOOK_DEPTH = 5

export type RecordBookRecap = {
	shareToken: string
	weekKey: string
	weekStart: Date
	weekEnd: Date
	playersOfTheWeek: RecapPlayerOfTheWeek[]
	bestCalls: RecapCall[]
}

export type RecordBookWeek = {
	week: RecapWeek
	// False for a week between two recaps that didn't get one: fewer than
	// RECAP_MIN_ACTIVE_MEMBERS settled a call in it.
	recapped: boolean
	// The recap's page, null with no recap.
	shareToken: string | null
	players: RecapPlayerOfTheWeek[]
}

export type RecordBookWeekScore = RecapPlayerOfTheWeek & { week: RecapWeek }
export type RecordBookCall = RecapCall & { week: RecapWeek }
export type RecordBookCount = { userId: string; count: number }
export type RecordBookRun = {
	userId: string
	length: number
	first: RecapWeek
	last: RecapWeek
}

export type RecordBook = {
	// Newest first, from the group's first recap through its latest.
	weeks: RecordBookWeek[]
	mostPointsInAWeek: RecordBookWeekScore[]
	mostPointsOnACall: RecordBookCall[]
	mostPlayerOfTheWeekAwards: RecordBookCount[]
	// Two or more in a row. Each member's longest run only.
	mostConsecutivePlayerOfTheWeekAwards: RecordBookRun[]
}

const asWeek = (r: RecordBookRecap): RecapWeek => ({
	key: r.weekKey,
	start: r.weekStart,
	end: r.weekEnd,
})

export function compileRecordBook(
	recaps: RecordBookRecap[],
	visible: Set<string>,
): RecordBook {
	const sorted = [...recaps].sort(
		(a, b) => a.weekStart.getTime() - b.weekStart.getTime(),
	)
	const first = sorted[0]
	const last = sorted.at(-1)
	const byKey = new Map(sorted.map((r) => [r.weekKey, r]))
	// Oldest first, for the runs below.
	const weeks: RecordBookWeek[] =
		first && last
			? weeksBetween(first.weekStart, last.weekStart).map((week) => {
					const recap = byKey.get(week.key)
					return recap
						? {
								week: asWeek(recap),
								recapped: true,
								shareToken: recap.shareToken,
								players: recap.playersOfTheWeek,
							}
						: { week, recapped: false, shareToken: null, players: [] }
				})
			: []

	const shown = (userId: string) => visible.has(userId)

	const mostPointsInAWeek = sorted
		.flatMap((r) =>
			r.playersOfTheWeek
				.filter((p) => shown(p.userId))
				.map((p) => ({ ...p, week: asWeek(r) })),
		)
		.sort(
			(a, b) =>
				b.points - a.points ||
				a.week.start.getTime() - b.week.start.getTime() ||
				a.userId.localeCompare(b.userId),
		)
		.slice(0, RECORD_BOOK_DEPTH)

	const mostPointsOnACall = sorted
		.flatMap((r) =>
			r.bestCalls
				.filter((c) => shown(c.userId))
				.map((c) => ({ ...c, week: asWeek(r) })),
		)
		.sort(
			(a, b) =>
				b.points - a.points ||
				a.week.start.getTime() - b.week.start.getTime() ||
				a.callId.localeCompare(b.callId),
		)
		.slice(0, RECORD_BOOK_DEPTH)

	const awards = new Map<string, number>()
	for (const week of weeks) {
		for (const p of week.players) {
			if (shown(p.userId)) awards.set(p.userId, (awards.get(p.userId) ?? 0) + 1)
		}
	}
	const mostPlayerOfTheWeekAwards = [...awards]
		.map(([userId, count]) => ({ userId, count }))
		.sort((a, b) => b.count - a.count || a.userId.localeCompare(b.userId))
		.slice(0, RECORD_BOOK_DEPTH)

	// A week without a recap, or one somebody else won, ends a run.
	const best = new Map<string, RecordBookRun>()
	const current = new Map<string, RecordBookRun>()
	for (const week of weeks) {
		const winners = new Set(week.players.map((p) => p.userId))
		for (const userId of current.keys()) {
			if (!winners.has(userId)) current.delete(userId)
		}
		for (const userId of winners) {
			const run = current.get(userId)
			const next = run
				? { ...run, length: run.length + 1, last: week.week }
				: { userId, length: 1, first: week.week, last: week.week }
			current.set(userId, next)
			if (next.length > (best.get(userId)?.length ?? 0)) best.set(userId, next)
		}
	}
	const mostConsecutivePlayerOfTheWeekAwards = [...best.values()]
		.filter((run) => run.length >= 2 && shown(run.userId))
		.sort(
			(a, b) =>
				b.length - a.length ||
				a.first.start.getTime() - b.first.start.getTime() ||
				a.userId.localeCompare(b.userId),
		)
		.slice(0, RECORD_BOOK_DEPTH)

	return {
		weeks: weeks.reverse(),
		mostPointsInAWeek,
		mostPointsOnACall,
		mostPlayerOfTheWeekAwards,
		mostConsecutivePlayerOfTheWeekAwards,
	}
}
