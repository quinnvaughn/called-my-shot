import {
	type QuestionShape,
	STREAK_FAMILY_BY_SHAPE,
	type StreakFamily,
} from "@called-my-shot/scoring"
import { and, gte, sql } from "drizzle-orm"
import { db } from "../../db"
import { sweepRecomputeQueue, userSweeps } from "../../db/schema"
import { buildSlateKey } from "./slate"

const FAMILY_SHAPES = (
	Object.entries(STREAK_FAMILY_BY_SHAPE) as [
		QuestionShape,
		StreakFamily | null,
	][]
).filter((entry): entry is [QuestionShape, StreakFamily] => entry[1] !== null)

// Marks every track and slate with a settled game question for a rebuild -
// all of history when `since` is null (the backfill), or just the games that
// started since then (the nightly reconcile, which catches what no settle
// event did: a flexed kickoff moving a game to another slot, or ESPN
// correcting when a game went final).
export async function enqueueAchievementRecomputes({
	since,
}: {
	since: Date | null
}): Promise<{ tracks: number; slates: number }> {
	const dirtiedAt = new Date()
	const sinceFilter = since
		? sql`and g.starts_at >= ${since.toISOString()}::timestamp`
		: sql``
	const familyCase = sql.join(
		FAMILY_SHAPES.map(([shape, family]) => sql`when ${shape} then ${family}`),
		sql` `,
	)
	const shapes = sql.join(
		FAMILY_SHAPES.map(([shape]) => sql`${shape}`),
		sql`, `,
	)

	const { rows: trackRows } = await db.execute<{ user_id: string }>(sql`
		insert into streak_recompute_queue (user_id, league_id, family, dirtied_at)
		select distinct c.user_id, q.league_id,
			(case q.shape::text ${familyCase} end)::streak_family,
			${dirtiedAt.toISOString()}::timestamp
		from calls c
		join questions q on q.id = c.question_id
		join games g on g.id = q.game_id
		where q.resolution_mode = 'system'
			and q.shape::text in (${shapes})
			and q.status in ('resolved', 'disputed', 'voided')
			${sinceFilter}
		on conflict (user_id, league_id, family)
			do update set dirtied_at = excluded.dirtied_at
		returning user_id
	`)

	const winnerGames = await db.execute<{
		league_id: string
		starts_at: string
		season_type: "regular" | "postseason"
		week_number: number | null
		slot: string | null
		window_type: "date" | "week"
		year: number
	}>(sql`
		select distinct g.league_id, g.starts_at, g.season_type, g.week_number,
			g.slot, l.window_type, s.year
		from questions q
		join games g on g.id = q.game_id
		join leagues l on l.id = g.league_id
		join seasons s on s.id = g.season_id
		where q.shape = 'team_vs_team'
			and q.status in ('resolved', 'disputed', 'voided')
			${sinceFilter}
	`)

	const slateKeys = new Map<string, { leagueId: string; slateKey: string }>()
	for (const row of winnerGames.rows) {
		const slateKey = buildSlateKey(
			{
				// Read back as UTC wall-clock, the form every timestamp column
				// here is stored in.
				startsAt: new Date(`${row.starts_at}Z`),
				seasonType: row.season_type,
				weekNumber: row.week_number,
				slot: row.slot,
			},
			row.window_type,
			row.year,
		)
		slateKeys.set(`${row.league_id}:${slateKey}`, {
			leagueId: row.league_id,
			slateKey,
		})
	}
	// Slates that hold a sweep but no longer match any game's key - the game
	// moved slot after the fact - are rebuilt too, which empties them.
	const existing = await db
		.selectDistinct({
			leagueId: userSweeps.leagueId,
			slateKey: userSweeps.slateKey,
		})
		.from(userSweeps)
		.where(since ? and(gte(userSweeps.settledAt, since)) : undefined)
	for (const row of existing) {
		slateKeys.set(`${row.leagueId}:${row.slateKey}`, row)
	}

	const slates = [...slateKeys.values()]
	if (slates.length > 0) {
		await db
			.insert(sweepRecomputeQueue)
			.values(slates.map((slate) => ({ ...slate, dirtiedAt })))
			.onConflictDoUpdate({
				target: [sweepRecomputeQueue.leagueId, sweepRecomputeQueue.slateKey],
				set: { dirtiedAt },
			})
	}

	return { tracks: trackRows.length, slates: slates.length }
}
