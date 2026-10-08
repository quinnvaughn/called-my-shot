import { sql } from "drizzle-orm"
import { db } from "../db"

// Which side the people a viewer shares a group with took on each question,
// per option: how many of them, and one of them to name. Every call is public
// (see Call in graphql/types/question/call.ts), so this shows nothing a
// group-mate's own profile wouldn't - it just gathers it where the viewer is
// about to pick.

export type GroupPickTally = {
	optionId: string
	count: number
	// The group-mate who picked it most recently, so the name on the card is
	// the freshest activity and only changes when someone actually calls.
	sampleUserId: string
}

// One list per question id, in key order: empty when no group-mate has called
// it. Someone in two of the viewer's groups counts once, and the viewer never
// counts at all.
export async function loadGroupPicks(
	viewerId: string,
	questionIds: string[],
): Promise<GroupPickTally[][]> {
	if (questionIds.length === 0) return []
	const { rows } = await db.execute<{
		question_id: string
		option_id: string
		count: number
		sample_user_id: string
	}>(sql`
		with mates as (
			select distinct mate.user_id
			from group_members me
			join group_members mate on mate.group_id = me.group_id
			where me.user_id = ${viewerId}
				and mate.user_id <> ${viewerId}
		)
		select c.question_id, cs.option_id, count(*)::int as count,
			(array_agg(c.user_id order by c.created_at desc, c.user_id))[1]
				as sample_user_id
		from calls c
		join mates m on m.user_id = c.user_id
		join call_selections cs on cs.call_id = c.id
		where c.question_id in ${questionIds}
		group by c.question_id, cs.option_id
	`)
	const byQuestion = new Map<string, GroupPickTally[]>()
	for (const row of rows) {
		const list = byQuestion.get(row.question_id) ?? []
		list.push({
			optionId: row.option_id,
			count: Number(row.count),
			sampleUserId: row.sample_user_id,
		})
		byQuestion.set(row.question_id, list)
	}
	return questionIds.map((id) => byQuestion.get(id) ?? [])
}
