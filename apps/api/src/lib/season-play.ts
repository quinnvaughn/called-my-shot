import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import {
	SEASON_PLAY_WEEK_MIN_CALLS,
	seasonPlayWeight,
} from "@called-my-shot/scoring"
import { inArray, type SQL, sql } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import { db } from "../db"
import { calls, games, questions } from "../db/schema"
import type { DbOrTx } from "../db/types"

// How regularly someone plays a league, as of a moment: the regular-season
// weeks they made at least SEASON_PLAY_WEEK_MIN_CALLS game calls in, out of
// the weeks that count. Only weeks that had game questions to call count, so
// the weeks of a season played before the league was on the site aren't
// read as skipped. A week counts once it's over, and the week still running
// counts early only once it's been played, so a week in progress never reads
// as one skipped. See seasonPlayWeight for what it's worth.
export type SeasonPlay = { weeksPlayed: number; weeksCounted: number }

export function seasonPlayWeightOf(play: SeasonPlay): number {
	return seasonPlayWeight(play.weeksPlayed, play.weeksCounted)
}

// The recap week a stored timestamp falls in (see weekContaining in
// lib/group-recap/week.ts): Tuesday 00:00 in the sports time zone, so an NFL
// week's Monday night game lands in the week it belongs to. Timestamps here
// are UTC without a zone, so they're read as UTC first.
const weekOf = (column: SQL | AnyPgColumn) =>
	sql`to_char(date_trunc('week', (${column} at time zone 'UTC' at time zone ${SPORTS_TIME_ZONE}) - interval '1 day') + interval '1 day', 'YYYY-MM-DD')`

// One week of a league season that had game questions to call, and how many
// game calls a user made in it. `over` is false only on the week still
// running.
export type SeasonPlayWeek = {
	startsOn: string
	calls: number
	over: boolean
}

// Every week of a league season up to `asOf`'s that had regular-season game
// questions, with each user's game calls in it. Game calls are bucketed by
// the week their question locks, which for a game question is its game's
// start, so calling Tuesday's games on Monday still plays Tuesday's week.
async function loadWeeks(
	seasonId: string,
	userIds: string[],
	asOf: Date,
	executor: DbOrTx,
): Promise<Map<string, SeasonPlayWeek[]>> {
	const asOfUtc = asOf.toISOString()

	const gameWeeks = await executor.execute<{ week: string; over: boolean }>(sql`
		select
			week,
			(week::date + 7)::timestamp
				<= (${asOfUtc}::timestamptz at time zone ${SPORTS_TIME_ZONE}) as over
		from (
			select distinct ${weekOf(questions.locksAt)} as week
			from ${questions}
			inner join ${games} on ${games.id} = ${questions.gameId}
			where ${questions.seasonId} = ${seasonId}
				and ${games.seasonType} = 'regular'
		) as weeks
		where week <= ${weekOf(sql`${asOfUtc}::timestamp`)}
		order by week
	`)

	const callRows = await executor.execute<{
		user_id: string
		week: string
		calls: number
	}>(sql`
		select
			${calls.userId} as user_id,
			${weekOf(questions.locksAt)} as week,
			count(*)::int as calls
		from ${calls}
		inner join ${questions} on ${questions.id} = ${calls.questionId}
		where ${questions.seasonId} = ${seasonId}
			and ${questions.gameId} is not null
			and ${calls.userId} in (${sql.join(
				userIds.map((id) => sql`${id}`),
				sql`, `,
			)})
		group by 1, 2
	`)
	const callsByKey = new Map(
		callRows.rows.map((row) => [`${row.user_id}:${row.week}`, row.calls]),
	)

	return new Map(
		userIds.map((userId) => [
			userId,
			gameWeeks.rows.map((row) => ({
				startsOn: row.week,
				calls: callsByKey.get(`${userId}:${row.week}`) ?? 0,
				over: row.over,
			})),
		]),
	)
}

const isPlayed = (week: SeasonPlayWeek) =>
	week.calls >= SEASON_PLAY_WEEK_MIN_CALLS

function playOf(weeks: SeasonPlayWeek[]): SeasonPlay {
	return {
		weeksPlayed: weeks.filter(isPlayed).length,
		weeksCounted: weeks.filter((week) => week.over || isPlayed(week)).length,
	}
}

// Each user's play in one league season, as of `asOf`.
export async function loadSeasonPlay(
	seasonId: string,
	userIds: string[],
	asOf: Date,
	executor: DbOrTx = db,
): Promise<Map<string, SeasonPlay>> {
	if (userIds.length === 0) return new Map()
	const weeks = await loadWeeks(seasonId, userIds, asOf, executor)
	return new Map(
		[...weeks].map(([userId, userWeeks]) => [userId, playOf(userWeeks)]),
	)
}

// One user's play in a league season with the weeks behind it, oldest first.
// Null before the season has had a week of game questions.
export async function loadSeasonPlayWeeks(
	seasonId: string,
	userId: string,
	asOf: Date,
	executor: DbOrTx = db,
): Promise<(SeasonPlay & { weeks: SeasonPlayWeek[] }) | null> {
	const weeks =
		(await loadWeeks(seasonId, [userId], asOf, executor)).get(userId) ?? []
	if (weeks.length === 0) return null
	return { ...playOf(weeks), weeks }
}

type PlayedCall = {
	id: string
	userId: string
	seasonPlayWeeksPlayed: number | null
	seasonPlayWeeksCounted: number | null
}

// Each call's season-play weight on a season-long question, keyed by call.
// A call's weeks are read once, the first time its question resolves, and
// saved on the call, so a re-resolve or overturn scores it at the same
// weight rather than at however the caller has played since.
export async function seasonPlayWeightsFor(
	tx: DbOrTx,
	question: { seasonId: string },
	questionCalls: PlayedCall[],
	asOf: Date = new Date(),
): Promise<Map<string, number>> {
	const unread = questionCalls.filter(
		(call) =>
			call.seasonPlayWeeksPlayed === null ||
			call.seasonPlayWeeksCounted === null,
	)
	const read = await loadSeasonPlay(
		question.seasonId,
		[...new Set(unread.map((call) => call.userId))],
		asOf,
		tx,
	)
	const playByCallId = new Map<string, SeasonPlay>()
	const callIdsByPlay = new Map<string, string[]>()
	for (const call of questionCalls) {
		const fresh = read.get(call.userId)
		const play =
			call.seasonPlayWeeksPlayed !== null &&
			call.seasonPlayWeeksCounted !== null
				? {
						weeksPlayed: call.seasonPlayWeeksPlayed,
						weeksCounted: call.seasonPlayWeeksCounted,
					}
				: fresh
		if (!play) continue
		playByCallId.set(call.id, play)
		if (play !== fresh) continue
		const key = `${play.weeksPlayed}:${play.weeksCounted}`
		callIdsByPlay.set(key, [...(callIdsByPlay.get(key) ?? []), call.id])
	}
	for (const [key, callIds] of callIdsByPlay) {
		const [weeksPlayed, weeksCounted] = key.split(":").map(Number)
		await tx
			.update(calls)
			.set({
				seasonPlayWeeksPlayed: weeksPlayed,
				seasonPlayWeeksCounted: weeksCounted,
			})
			.where(inArray(calls.id, callIds))
	}

	return new Map(
		[...playByCallId].map(([callId, play]) => [
			callId,
			seasonPlayWeightOf(play),
		]),
	)
}
