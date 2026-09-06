import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import { sql } from "drizzle-orm"
import { DateTime } from "luxon"
import { db } from "../../../db"
import type { Game, League } from "../../../db/schema"
import { NFL_SLOT_LABELS } from "../../../db/sync/nfl-slot"
import { parsePgTimestamp } from "../../../lib/pg-timestamp"
import { builder } from "../../builder"
import { GameRef } from "./game"

// One page of a league's Games tab, in the shape the league's own windowType
// dictates - a single day (MLB/NBA) or a single week (NFL). Bounded to what's
// actually synced (see getLeagueWindows below), never an infinite-future
// list.
type WindowDescriptor = {
	key: string
	label: string
	sublabel: string | null
	gameCount: number
	rangeStart: Date
	rangeEnd: Date
}

export const GameWindowRef = builder
	.objectRef<WindowDescriptor>("GameWindow")
	.implement({
		fields: (t) => ({
			key: t.exposeString("key"),
			label: t.exposeString("label"),
			sublabel: t.exposeString("sublabel", { nullable: true }),
			gameCount: t.exposeInt("gameCount"),
		}),
	})

export type SlotGroup = { slotLabel: string | null; games: Game[] }

const GameSlotGroupRef = builder
	.objectRef<SlotGroup>("GameSlotGroup")
	.implement({
		fields: (t) => ({
			slotLabel: t.exposeString("slotLabel", { nullable: true }),
			games: t.field({ type: [GameRef], resolve: (g) => g.games }),
		}),
	})

type LeagueGamesForWindowResult = {
	window: WindowDescriptor
	prevKey: string | null
	nextKey: string | null
	groups: SlotGroup[]
}

export const LeagueGamesForWindowResultRef = builder
	.objectRef<LeagueGamesForWindowResult>("LeagueGamesForWindowResult")
	.implement({
		fields: (t) => ({
			window: t.field({ type: GameWindowRef, resolve: (r) => r.window }),
			prevKey: t.exposeString("prevKey", { nullable: true }),
			nextKey: t.exposeString("nextKey", { nullable: true }),
			groups: t.field({ type: [GameSlotGroupRef], resolve: (r) => r.groups }),
		}),
	})

// Slot vocabulary is owned entirely by each week-window league's own sync
// module (see games.slot's comment in db/schema/games.ts) - this is just the
// lookup from league slug to that module's maps, not a generic mechanism.
export const SLOT_LABELS_BY_LEAGUE: Record<string, Record<string, string>> = {
	nfl: NFL_SLOT_LABELS,
}

// Re-exported rather than declared here so the Games tab's bucketing and the
// question titles that name a game's date can never disagree about which
// zone "that game's day" means.
export const ET_ZONE = SPORTS_TIME_ZONE

// Every window this league has synced games for, oldest first. Date-window
// leagues (MLB/NBA) get one window per ET calendar date; week-window leagues
// (NFL) get one per (season, seasonType, weekNumber). Both are computed
// on read, grouped straight off `games` - there's no separate "windows"
// table, so a window only ever exists because a real game does.
export async function getLeagueWindows(
	league: League,
): Promise<WindowDescriptor[]> {
	if (league.windowType === "week") {
		const result = await db.execute<{
			season_id: string
			season_type: "regular" | "postseason"
			week_number: number
			min_starts: string
			max_starts: string
			week_starts: string | null
			week_ends: string | null
			n: number
		}>(sql`
			select g.season_id, g.season_type, g.week_number,
				min(g.starts_at) as min_starts, max(g.starts_at) as max_starts,
				min(w.starts_at) as week_starts, min(w.ends_at) as week_ends,
				count(*)::int as n
			from games g
			left join season_weeks w
				on w.season_id = g.season_id
				and w.season_type = g.season_type
				and w.week_number = g.week_number
			where g.league_id = ${league.id} and g.week_number is not null
			group by g.season_id, g.season_type, g.week_number
			order by min_starts asc
		`)
		return result.rows.map((row) => {
			const start = DateTime.fromJSDate(parsePgTimestamp(row.min_starts), {
				zone: ET_ZONE,
			})
			const end = DateTime.fromJSDate(parsePgTimestamp(row.max_starts), {
				zone: ET_ZONE,
			})
			const label =
				row.season_type === "postseason"
					? `POSTSEASON WEEK ${row.week_number}`
					: `WEEK ${row.week_number}`
			return {
				key: `${row.season_id}:${row.season_type}:${row.week_number}`,
				label,
				// Dated by the games themselves, not by the window bounds below -
				// "SEP 9 – SEP 14" is what's actually being played; ESPN's week 1
				// runs from the Sunday the season type opens, days before its
				// first kickoff.
				sublabel: `${start.toFormat("LLL d").toUpperCase()} – ${end.toFormat("LLL d").toUpperCase()}`,
				gameCount: row.n,
				// ESPN's own week boundaries where they're synced (see seasonWeeks
				// in db/schema/games.ts) - contiguous, so mid-season there's
				// always exactly one window holding "now", including the Tuesday
				// after Monday Night Football. Falls back to the span of the
				// week's own games for a week ESPN hasn't published boundaries
				// for, which does leave a gap between weeks - better than a
				// window with no range at all.
				rangeStart: row.week_starts
					? parsePgTimestamp(row.week_starts)
					: start.startOf("day").toJSDate(),
				rangeEnd: row.week_ends
					? parsePgTimestamp(row.week_ends)
					: end.endOf("day").toJSDate(),
			}
		})
	}

	const result = await db.execute<{ d: string; n: number }>(sql`
		select (starts_at at time zone 'UTC' at time zone ${ET_ZONE})::date as d,
			count(*)::int as n
		from games
		where league_id = ${league.id}
		group by d
		order by d asc
	`)
	return result.rows.map((row) => {
		const day = DateTime.fromISO(row.d, { zone: ET_ZONE })
		return {
			key: day.toFormat("yyyy-LL-dd"),
			label: day.toFormat("ccc LLL d").toUpperCase(),
			sublabel: null,
			gameCount: row.n,
			rangeStart: day.startOf("day").toJSDate(),
			rangeEnd: day.endOf("day").toJSDate(),
		}
	})
}

// windowKey omitted -> "today"/"this week" if it has synced games, else the
// nearest upcoming window, else the most recent past one.
export function pickDefaultWindowIndex(windows: WindowDescriptor[]): number {
	const now = new Date()
	const currentIdx = windows.findIndex(
		(w) => w.rangeStart <= now && now <= w.rangeEnd,
	)
	if (currentIdx !== -1) return currentIdx
	const upcomingIdx = windows.findIndex((w) => w.rangeStart > now)
	if (upcomingIdx !== -1) return upcomingIdx
	return windows.length - 1
}
