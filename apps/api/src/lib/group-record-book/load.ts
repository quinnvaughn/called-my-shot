import { and, asc, count, eq, inArray, sql } from "drizzle-orm"
import { db } from "../../db"
import { type Group, groupRecaps, type User, userSweeps } from "../../db/schema"
import type { RecapCall, RecapPlayerOfTheWeek } from "../group-recap/types"
import { loadGameVerdicts } from "../game-entry"
import { recapQuestionTitle } from "../group-recap/view"
import type { RecapWeek } from "../group-recap/week"
import { getTrackedLeagueIds } from "../groups"
import {
	compileRecordBook,
	RECORD_BOOK_DEPTH,
	type RecordBookCount,
	type RecordBookRun,
	type RecordBookWeekScore,
} from "./compute"

// Reads a group's recaps for ./compute.ts, then puts names and titles on
// what it hands back. Sweeps come off user_sweeps and perfect cards off the
// members' calls instead, bound the way the group's highlights are: its
// members, in the leagues it tracks.

export type RecordBookWeekView = {
	week: RecapWeek
	recapped: boolean
	shareToken: string | null
	// User is null for a winner who has since left the group or opted out of
	// recaps: the week still had a winner, it just can't name them.
	players: (Omit<RecapPlayerOfTheWeek, "userId"> & { user: User | null })[]
}

export type RecordBookCallView = {
	user: User
	points: number
	week: RecapWeek
	callId: string
	headline: string
	leagueAbbr: string
}

type Named<T extends { userId: string }> = Omit<T, "userId"> & { user: User }

export type RecordBookView = {
	weeks: RecordBookWeekView[]
	mostPointsInAWeek: Named<RecordBookWeekScore>[]
	mostPointsOnACall: RecordBookCallView[]
	mostPlayerOfTheWeekAwards: Named<RecordBookCount>[]
	mostConsecutivePlayerOfTheWeekAwards: Named<RecordBookRun>[]
	mostSweeps: Named<RecordBookCount>[]
	mostPerfectCards: Named<RecordBookCount>[]
}

async function loadSweepCounts(
	memberIds: string[],
	tracked: string[] | null,
): Promise<RecordBookCount[]> {
	if (memberIds.length === 0) return []
	const sweeps = count()
	return db
		.select({ userId: userSweeps.userId, count: sweeps })
		.from(userSweeps)
		.where(
			and(
				inArray(userSweeps.userId, memberIds),
				...(tracked ? [inArray(userSweeps.leagueId, tracked)] : []),
			),
		)
		.groupBy(userSweeps.userId)
		.orderBy(sql`${sweeps} desc`, asc(userSweeps.userId))
		.limit(RECORD_BOOK_DEPTH)
}

async function loadPerfectCardCounts(
	memberIds: string[],
	tracked: string[] | null,
): Promise<RecordBookCount[]> {
	const verdicts = await loadGameVerdicts(memberIds, tracked, null)
	const counts = new Map<string, number>()
	for (const v of verdicts) {
		if (v.verdict === "perfect") {
			counts.set(v.userId, (counts.get(v.userId) ?? 0) + 1)
		}
	}
	return [...counts]
		.map(([userId, count]) => ({ userId, count }))
		.sort((a, b) => b.count - a.count || a.userId.localeCompare(b.userId))
		.slice(0, RECORD_BOOK_DEPTH)
}

export async function loadRecordBook(group: Group): Promise<RecordBookView> {
	const [members, tracked, recaps] = await Promise.all([
		db.query.groupMembers.findMany({
			where: { groupId: group.id },
			columns: { userId: true, hiddenFromRecaps: true },
		}),
		getTrackedLeagueIds(group.id),
		// Only the two parts of each recap's data this reads, rather than every
		// moment of every week the group has had.
		db
			.select({
				shareToken: groupRecaps.shareToken,
				weekKey: groupRecaps.weekKey,
				weekStart: groupRecaps.weekStart,
				weekEnd: groupRecaps.weekEnd,
				playersOfTheWeek: sql<
					RecapPlayerOfTheWeek[]
				>`coalesce(${groupRecaps.data}->'playersOfTheWeek', '[]'::jsonb)`,
				bestCalls: sql<RecapCall[]>`${groupRecaps.data}->'bestCalls'`,
			})
			.from(groupRecaps)
			.where(eq(groupRecaps.groupId, group.id)),
	])
	const visible = new Set(
		members.filter((m) => !m.hiddenFromRecaps).map((m) => m.userId),
	)
	const book = compileRecordBook(recaps, visible)
	const memberIds = members.map((m) => m.userId)
	const [sweepCounts, perfectCardCounts] = await Promise.all([
		loadSweepCounts(memberIds, tracked),
		loadPerfectCardCounts(memberIds, tracked),
	])

	const userIds = new Set([
		...book.weeks.flatMap((w) => w.players.map((p) => p.userId)),
		...book.mostPointsOnACall.map((c) => c.userId),
		...sweepCounts.map((s) => s.userId),
		...perfectCardCounts.map((p) => p.userId),
	])
	const callIds = book.mostPointsOnACall.map((c) => c.callId)
	const [users, calls] = await Promise.all([
		userIds.size
			? db.query.users.findMany({ where: { id: { in: [...userIds] } } })
			: [],
		callIds.length
			? db.query.calls.findMany({
					where: { id: { in: callIds } },
					columns: { id: true },
					with: {
						question: {
							columns: { title: true },
							with: {
								league: { columns: { abbreviation: true } },
								game: {
									columns: { id: true },
									with: {
										homeTeam: { columns: { abbreviation: true } },
										awayTeam: { columns: { abbreviation: true } },
									},
								},
							},
						},
					},
				})
			: [],
	])
	const userById = new Map(users.map((u) => [u.id, u]))
	const callById = new Map(calls.map((c) => [c.id, c]))

	// A row whose member has been deleted is dropped rather than drawn
	// nameless.
	function named<T extends { userId: string }>(rows: T[]): Named<T>[] {
		return rows.flatMap(({ userId, ...rest }) => {
			const user = userById.get(userId)
			return user ? [{ ...rest, user }] : []
		})
	}

	return {
		weeks: book.weeks.map(({ week, recapped, shareToken, players }) => ({
			week,
			recapped,
			shareToken,
			players: players.map(({ userId, ...rest }) => ({
				...rest,
				user: (visible.has(userId) && userById.get(userId)) || null,
			})),
		})),
		mostPointsInAWeek: named(book.mostPointsInAWeek),
		mostPointsOnACall: book.mostPointsOnACall.flatMap((c) => {
			const user = userById.get(c.userId)
			const question = callById.get(c.callId)?.question
			if (!user || !question?.league) return []
			return [
				{
					user,
					points: c.points,
					week: c.week,
					callId: c.callId,
					headline: recapQuestionTitle(question),
					leagueAbbr: question.league.abbreviation.toUpperCase(),
				},
			]
		}),
		mostPlayerOfTheWeekAwards: named(book.mostPlayerOfTheWeekAwards),
		mostConsecutivePlayerOfTheWeekAwards: named(
			book.mostConsecutivePlayerOfTheWeekAwards,
		),
		mostSweeps: named(sweepCounts),
		mostPerfectCards: named(perfectCardCounts),
	}
}
