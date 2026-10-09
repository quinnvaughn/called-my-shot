import { sql } from "drizzle-orm"
import { db } from "../db"
import { tallyCalls } from "./pick-entry"

// One member's progress on a ballot, for the group ballot board. Same record
// and points as their /ballots/:slug/:username page (both go through
// tallyCalls). Only members with at least one call get one.
export type GroupBallotEntry = {
	userId: string
	calledCount: number
	wins: number
	losses: number
	points: number
	// When they called the last member they hadn't, once every member is
	// called. Same rule as Ballot.completions, so the board and the public
	// list agree on who finished and when.
	completedAt: Date | null
}

export async function loadGroupBallotEntries(
	ballotId: string,
	memberIds: string[],
): Promise<GroupBallotEntry[]> {
	if (memberIds.length === 0) return []
	const members = await db.query.ballotQuestions.findMany({
		where: { ballotId },
		columns: { questionId: true },
	})
	if (members.length === 0) return []

	const rows = await db.query.calls.findMany({
		where: {
			userId: { in: memberIds },
			questionId: { in: members.map((m) => m.questionId) },
		},
		with: {
			question: { columns: { status: true } },
			selections: {
				columns: { resultPoints: true },
				with: { option: { columns: { isCorrect: true } } },
			},
		},
	})

	const byUser = new Map<string, typeof rows>()
	for (const row of rows) {
		const list = byUser.get(row.userId)
		if (list) list.push(row)
		else byUser.set(row.userId, [row])
	}

	return [...byUser].map(([userId, userRows]) => {
		const finished = userRows.length === members.length
		return {
			userId,
			calledCount: userRows.length,
			...tallyCalls(
				userRows.map((row) => ({ call: row, status: row.question?.status })),
			),
			completedAt: finished
				? new Date(Math.max(...userRows.map((r) => r.createdAt.getTime())))
				: null,
		}
	})
}

// Finished entries first, earliest finisher on top, then everyone still
// going by how far along they are. Once any member has a settled pick it
// reads as that ballot's leaderboard instead: points, then progress.
export function sortGroupBallotEntries<
	E extends GroupBallotEntry & { user: { name: string } },
>(entries: E[]): E[] {
	const hasResults = entries.some((e) => e.wins + e.losses > 0)
	const byProgress = (a: E, b: E) => {
		if (a.completedAt && b.completedAt) {
			return a.completedAt.getTime() - b.completedAt.getTime()
		}
		if (a.completedAt) return -1
		if (b.completedAt) return 1
		return b.calledCount - a.calledCount
	}
	return [...entries].sort(
		(a, b) =>
			(hasResults ? b.points - a.points : 0) ||
			byProgress(a, b) ||
			a.user.name.localeCompare(b.user.name),
	)
}

export type ViewerGroupBallotProgress = {
	groupId: string
	memberCount: number
	startedCount: number
	finishedCount: number
}

// The viewer's groups that follow this ballot's league (or every league),
// with how far their members have got on it. Most finished first. What the
// ballot page links to each group's board from.
export async function loadViewerGroupsOnBallot(
	viewerId: string,
	ballot: { id: string; leagueId: string },
): Promise<ViewerGroupBallotProgress[]> {
	const { rows } = await db.execute<{
		group_id: string
		member_count: number
		started_count: number
		finished_count: number
	}>(sql`
		with viewer_groups as (
			select gm.group_id
			from group_members gm
			where gm.user_id = ${viewerId}
				and (
					not exists (
						select 1 from group_leagues gl where gl.group_id = gm.group_id
					)
					or exists (
						select 1 from group_leagues gl
						where gl.group_id = gm.group_id and gl.league_id = ${ballot.leagueId}
					)
				)
		),
		total as (
			select count(*)::int as n from ballot_questions where ballot_id = ${ballot.id}
		),
		progress as (
			select c.user_id, count(distinct c.question_id)::int as called
			from calls c
			join ballot_questions bq on bq.question_id = c.question_id
			where bq.ballot_id = ${ballot.id}
				and c.user_id in (
					select gm.user_id from group_members gm
					where gm.group_id in (select group_id from viewer_groups)
				)
			group by c.user_id
		)
		select gm.group_id,
			count(*)::int as member_count,
			count(p.user_id)::int as started_count,
			count(*) filter (where p.called = (select n from total))::int as finished_count
		from group_members gm
		join viewer_groups vg on vg.group_id = gm.group_id
		left join progress p on p.user_id = gm.user_id
		group by gm.group_id
		order by finished_count desc, started_count desc, gm.group_id
	`)
	return rows.map((r) => ({
		groupId: r.group_id,
		memberCount: r.member_count,
		startedCount: r.started_count,
		finishedCount: r.finished_count,
	}))
}
