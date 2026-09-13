import { sql } from "drizzle-orm"
import { db } from "../db"

// Questions their creator resolved by hand - the only results nobody else
// checked. A system or admin resolution is excluded even on a user's own
// question.
const handGradedQuestions = (creatorId?: string) => sql`
	select q.id, q.creator_id
	from questions q
	where q.resolution_method = 'creator'
		and q.resolved_by_user_id = q.creator_id
		and q.status in ('resolved', 'disputed')
		${creatorId ? sql`and q.creator_id = ${creatorId}` : sql``}
`

// Each scored call on those questions with its final points and whether it
// was right. Unscored calls are left out: they moved nothing.
const scoredCallOutcomes = sql`
	select
		c.id,
		c.user_id,
		c.question_id,
		coalesce(c.result_points, sum(cs.result_points))::int as points,
		coalesce(c.hit_tolerance, bool_or(o.is_correct)) as correct
	from calls c
	left join call_selections cs on cs.call_id = c.id
	left join question_options o on o.id = cs.option_id
	where c.question_id in (select id from hand)
		and c.unscored_reason is null
	group by c.id
`

export type SelfGradingRow = {
	userId: string
	username: string
	handGradedCount: number
	ownCallCount: number
	ownCallWins: number
	ownCallLosses: number
	ownCallPoints: number
	totalPoints: number
	overturnedCount: number
}

// One row per creator who has hand-graded a question, ranked by the points
// their own calls earned on those questions. Ranked by points rather than by
// share of their total: a total can be zero or negative, which makes a ratio
// meaningless as a sort.
export async function loadSelfGradingReport(): Promise<SelfGradingRow[]> {
	const result = await db.execute<{
		user_id: string
		username: string
		hand_graded_count: number
		own_call_count: number
		own_call_wins: number
		own_call_losses: number
		own_call_points: number
		total_points: number
		overturned_count: number
	}>(sql`
		with hand as (${handGradedQuestions()}),
		outcome as (${scoredCallOutcomes})
		select
			u.id as user_id,
			u.username,
			count(distinct h.id)::int as hand_graded_count,
			count(co.id) filter (where co.user_id = h.creator_id)::int as own_call_count,
			count(co.id) filter (where co.user_id = h.creator_id and co.correct)::int as own_call_wins,
			count(co.id) filter (where co.user_id = h.creator_id and not co.correct)::int as own_call_losses,
			coalesce(sum(co.points) filter (where co.user_id = h.creator_id), 0)::int as own_call_points,
			(select coalesce(sum(s.points), 0) from user_season_stats s where s.user_id = u.id)::int as total_points,
			(
				select count(*)
				from resolution_disputes d
				join questions q2 on q2.id = d.question_id
				where q2.creator_id = u.id and d.status = 'overturned'
			)::int as overturned_count
		from hand h
		join users u on u.id = h.creator_id
		left join outcome co on co.question_id = h.id
		group by u.id
		order by own_call_points desc, hand_graded_count desc
	`)

	return result.rows.map((row) => ({
		userId: row.user_id,
		username: row.username,
		handGradedCount: row.hand_graded_count,
		ownCallCount: row.own_call_count,
		ownCallWins: row.own_call_wins,
		ownCallLosses: row.own_call_losses,
		ownCallPoints: row.own_call_points,
		totalPoints: row.total_points,
		overturnedCount: row.overturned_count,
	}))
}

export type CoCallerRow = {
	userId: string
	username: string
	emailVerified: boolean
	joinedAt: Date
	sharedCount: number
	wins: number
	losses: number
	points: number
	// Of every call this user has ever made, the fraction that were on this
	// creator's hand-graded questions.
	shareOfTheirCalls: number
}

// Other users who keep calling one creator's hand-graded questions. A second
// account propping up a creator shows up here: it calls almost nothing else,
// often loses, and often never verified an email - calling doesn't require it.
export async function loadFrequentCoCallers(
	creatorId: string,
	minShared: number,
): Promise<CoCallerRow[]> {
	const result = await db.execute<{
		user_id: string
		username: string
		email_verified: boolean
		created_at: Date
		shared_count: number
		wins: number
		losses: number
		points: number
		share_of_their_calls: number
	}>(sql`
		with hand as (${handGradedQuestions(creatorId)}),
		outcome as (${scoredCallOutcomes})
		select
			co.user_id,
			u.username,
			u.email_verified,
			u.created_at,
			count(*)::int as shared_count,
			count(*) filter (where co.correct)::int as wins,
			count(*) filter (where not co.correct)::int as losses,
			coalesce(sum(co.points), 0)::int as points,
			(
				count(*)::float
				/ (select count(*) from calls c2 where c2.user_id = co.user_id)
			) as share_of_their_calls
		from outcome co
		join users u on u.id = co.user_id
		where co.user_id <> ${creatorId}
		group by co.user_id, u.id
		having count(*) >= ${minShared}
		order by shared_count desc, wins desc
	`)

	return result.rows.map((row) => ({
		userId: row.user_id,
		username: row.username,
		emailVerified: row.email_verified,
		joinedAt: new Date(row.created_at),
		sharedCount: row.shared_count,
		wins: row.wins,
		losses: row.losses,
		points: row.points,
		shareOfTheirCalls: row.share_of_their_calls,
	}))
}
