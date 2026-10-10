import { db } from "../../db"
import type { User } from "../../db/schema"
import type { GroupLeaderboardEntry } from "../group-leaderboard"
import { rankEntries } from "../scoring"
import { weekTotals } from "./compute"
import { loadWeekAwards, loadWeekCalls } from "./load"
import { type RecapWeek, weekContaining } from "./week"

// What the group's leaderboard shows of Player of the Week: the week in
// progress ranked the way it will be decided, and a crown for whoever won
// the last one.

// One week's board, read off the same calls and bonuses a recap counts, so
// the member on top when the week closes is the one its recap names (given
// they reach PLAYER_OF_THE_WEEK_MIN_CALLS). Counts are calls rather than the
// season board's picks: a two-pick award call is one result here, as it is
// on the recap.
export async function buildGroupWeekLeaderboard(
	groupId: string,
	leagueIds: string[] | null,
	week: RecapWeek = weekContaining(new Date()),
): Promise<GroupLeaderboardEntry[]> {
	const memberships = await db.query.groupMembers.findMany({
		where: { groupId },
		with: { user: true },
	})
	const members = memberships.flatMap((m) => (m.user ? [m.user] : []))
	if (members.length === 0) return []
	const memberIds = members.map((u) => u.id)

	const [calls, awards] = await Promise.all([
		loadWeekCalls(memberIds, leagueIds, week),
		loadWeekAwards(memberIds, leagueIds, week),
	])
	const totals = new Map(weekTotals(calls, awards).map((t) => [t.userId, t]))

	return rankEntries(
		members.map((user) => {
			const total = totals.get(user.id)
			const settled = total ? total.wins + total.losses : 0
			return {
				user,
				totalPoints: total?.points ?? 0,
				accuracy: total && settled > 0 ? (total.wins / settled) * 100 : null,
				callCount: settled,
				resolvedCallCount: settled,
			}
		}),
	)
}

export type ReigningPlayersOfTheWeek = { week: RecapWeek; users: User[] }

// The newest recap's winners, the same ones its card names, until a newer
// recap names someone else. Null when the group has no recap or nobody
// qualified in its newest. A winner hidden from recaps gets no crown, the
// same as they get no slot on the recap.
export async function loadReigningPlayersOfTheWeek(
	groupId: string,
): Promise<ReigningPlayersOfTheWeek | null> {
	const recap = await db.query.groupRecaps.findFirst({
		where: { groupId },
		orderBy: { weekStart: "desc" },
		columns: { weekKey: true, weekStart: true, weekEnd: true, data: true },
	})
	if (!recap) return null
	const week = {
		key: recap.weekKey,
		start: recap.weekStart,
		end: recap.weekEnd,
	}
	const winners = recap.data.playersOfTheWeek ?? []
	if (winners.length === 0) return null

	const members = await db.query.groupMembers.findMany({
		where: {
			groupId,
			hiddenFromRecaps: false,
			userId: { in: winners.map((w) => w.userId) },
		},
		with: { user: true },
	})
	const users = members.flatMap((m) => (m.user ? [m.user] : []))
	return users.length > 0 ? { week, users } : null
}
