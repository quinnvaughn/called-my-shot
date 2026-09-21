import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import { and, eq, gte, lte, sql } from "drizzle-orm"
import { DateTime } from "luxon"
import { match } from "ts-pattern"
import { db } from "../../../db"
import { type Game, games, type League } from "../../../db/schema"
import { parsePgTimestamp } from "../../../lib/pg-timestamp"
import { loadReportCardResult } from "../../../lib/report-card/load"
import {
	loadSlateProgress,
	type SlateProgress,
} from "../../../lib/streaks/progress"
import {
	SEASON_TYPE_CODE,
	seasonTypeFromCode,
} from "../../../lib/streaks/slate"
import { builder } from "../../builder"
import { GameRef } from "./game"
import { ReportCardRef } from "./report-card"

// What a window actually is, kept structured rather than parsed back out of
// its own key. The resolver below used to rebuild seasonId/seasonType/
// weekNumber by splitting the string it had built three functions earlier,
// which meant a change to the key format silently turned seasonId into
// undefined and returned no games at all.
export type WindowScope =
	| { kind: "day"; day: string }
	| {
			kind: "week"
			seasonId: string
			seasonType: Game["seasonType"]
			weekNumber: number
			seasonYear: number
	  }

// One page of a league's Games tab, in the shape the league's own windowType
// dictates - a single day (MLB/NBA) or a single week (NFL). Bounded to what's
// actually synced (see getLeagueWindows below), never an infinite-future
// list.
export type WindowDescriptor = {
	// Url-safe and human-readable: "2026-09-20" for a date league, "2026-reg-w3"
	// for a week league. Derived from `scope`, never parsed back into it.
	key: string
	label: string
	sublabel: string | null
	gameCount: number
	rangeStart: Date
	rangeEnd: Date
	scope: WindowScope
}

// "2026-reg-w3". Deliberately the same shape as the week prefix buildSlateKey
// produces for sweep urls, so a report card link and a sweep link read as the
// same family. seasons is unique on (leagueId, year) and a key is only ever
// resolved within one league, so the year identifies the season without the
// uuid this used to carry.
export function buildWeekWindowKey(
	seasonYear: number,
	seasonType: Game["seasonType"],
	weekNumber: number,
): string {
	return `${seasonYear}-${SEASON_TYPE_CODE[seasonType]}-w${weekNumber}`
}

const DAY_WINDOW_KEY = /^\d{4}-\d{2}-\d{2}$/
const WEEK_WINDOW_KEY = /^(\d{4})-(reg|post)-w(\d+)$/

// Validates a key arriving from a url before anything touches the database.
// Null for anything that isn't one of the two formats.
export function parseWindowKey(key: string):
	| { kind: "day"; day: string }
	| {
			kind: "week"
			seasonYear: number
			seasonType: Game["seasonType"]
			weekNumber: number
	  }
	| null {
	if (DAY_WINDOW_KEY.test(key)) return { kind: "day", day: key }
	const week = WEEK_WINDOW_KEY.exec(key)
	if (week?.[1] && week[2] && week[3]) {
		return {
			kind: "week",
			seasonYear: Number(week[1]),
			seasonType: seasonTypeFromCode(week[2]),
			weekNumber: Number(week[3]),
		}
	}
	return null
}

// The predicate that decides which games a window holds. Exported because the
// report card has to grade exactly the games the Games tab lists, and the two
// branches are not interchangeable: a week league's games are selected by
// (seasonId, seasonType, weekNumber), NOT by rangeStart/rangeEnd. The range
// comes from ESPN's published week boundaries and falls back to the span of
// the week's own games when a week isn't synced, which "does leave a gap
// between weeks" - so a kickoff the tab happily lists can sit outside it.
// One function means the card and the list can never disagree.
export function windowGameFilter(window: WindowDescriptor) {
	return match(window.scope)
		.with({ kind: "week" }, (scope) =>
			and(
				eq(games.seasonId, scope.seasonId),
				eq(games.seasonType, scope.seasonType),
				eq(games.weekNumber, scope.weekNumber),
			),
		)
		.with({ kind: "day" }, () =>
			and(
				gte(games.startsAt, window.rangeStart),
				lte(games.startsAt, window.rangeEnd),
			),
		)
		.exhaustive()
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

const SweepProgressStatus = builder.enumType("SweepProgressStatus", {
	values: {
		ALIVE: { value: "alive" },
		OFF: { value: "off" },
		SWEPT: { value: "swept" },
	} as const,
})

type SlateSweepProgress = SlateProgress & { slateKey: string; games: Game[] }

// The viewer's run at sweeping the slate a slot group makes up - see
// slateProgress in lib/streaks/progress.ts.
const SlateSweepProgressRef = builder
	.objectRef<SlateSweepProgress>("SlateSweepProgress")
	.implement({
		fields: (t) => ({
			status: t.field({ type: SweepProgressStatus, resolve: (p) => p.status }),
			slateKey: t.exposeString("slateKey"),
			// Games in the slate with a who-wins question that wasn't voided.
			gameCount: t.exposeInt("gameCount"),
			calledCount: t.exposeInt("calledCount"),
			winCount: t.exposeInt("winCount"),
			lossCount: t.exposeInt("lossCount"),
			pendingCount: t.exposeInt("pendingCount"),
			// Locked without the viewer's pick.
			missedGames: t.field({
				type: [GameRef],
				resolve: (p) => p.games.filter((g) => p.missedGameIds.includes(g.id)),
			}),
			lostGames: t.field({
				type: [GameRef],
				resolve: (p) => p.games.filter((g) => p.lostGameIds.includes(g.id)),
			}),
		}),
	})

const GameSlotGroupRef = builder
	.objectRef<SlotGroup>("GameSlotGroup")
	.implement({
		fields: (t) => ({
			slotLabel: t.exposeString("slotLabel", { nullable: true }),
			games: t.field({ type: [GameRef], resolve: (g) => g.games }),
			// Null signed out, and for a group that isn't one sweepable slate.
			viewerSweep: t.field({
				type: SlateSweepProgressRef,
				nullable: true,
				resolve: async (group, _args, ctx) => {
					if (!ctx.user) return null
					const progress = await loadSlateProgress(ctx.user.id, group.games)
					return progress ? { ...progress, games: group.games } : null
				},
			}),
		}),
	})

type LeagueGamesForWindowResult = {
	leagueId: string
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
			// The window-level sibling of each slot group's viewerSweep. Hung
			// here rather than on a root query so the inline card costs no extra
			// round trip and is scoped, by construction, to the window the
			// stepper already selected. Null signed out; an empty card otherwise,
			// which the client renders as nothing.
			viewerReportCard: t.field({
				type: ReportCardRef,
				nullable: true,
				resolve: async (result, _args, ctx) => {
					if (!ctx.user || result.window.key === "") return null
					const league = await db.query.leagues.findFirst({
						where: { id: result.leagueId },
					})
					if (!league) return null
					return loadReportCardResult(ctx.user.id, league, result.window)
				},
			}),
		}),
	})

export { SLOT_LABELS_BY_LEAGUE } from "../../../db/sync/slot-labels"

// Re-exported rather than declared here so the Games tab's bucketing and the
// question titles that name a game's date can never disagree about which
// zone "that game's day" means.
export const ET_ZONE = SPORTS_TIME_ZONE

// ESPN's Wednesday 3am ET week boundary moved to the Tuesday before it.
// Stepped back in ET rather than by 24 raw hours so a DST change that week
// still lands on 3am.
function weekBoundary(espnBoundary: string): Date {
	return DateTime.fromJSDate(parsePgTimestamp(espnBoundary), { zone: ET_ZONE })
		.minus({ days: 1 })
		.toJSDate()
}

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
			season_year: number
			min_starts: string
			max_starts: string
			week_starts: string | null
			week_ends: string | null
			n: number
		}>(sql`
			select g.season_id, g.season_type, g.week_number, s.year as season_year,
				min(g.starts_at) as min_starts, max(g.starts_at) as max_starts,
				min(w.starts_at) as week_starts, min(w.ends_at) as week_ends,
				count(*)::int as n
			from games g
			join seasons s on s.id = g.season_id
			left join season_weeks w
				on w.season_id = g.season_id
				and w.season_type = g.season_type
				and w.week_number = g.week_number
			where g.league_id = ${league.id} and g.week_number is not null
			group by g.season_id, g.season_type, g.week_number, s.year
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
				key: buildWeekWindowKey(
					row.season_year,
					row.season_type,
					row.week_number,
				),
				scope: {
					kind: "week" as const,
					seasonId: row.season_id,
					seasonType: row.season_type,
					weekNumber: row.week_number,
					seasonYear: row.season_year,
				},
				label,
				// Dated by the games themselves, not by the window bounds below -
				// "SEP 9 – SEP 14" is what's actually being played; ESPN's week 1
				// runs from the Sunday the season type opens, days before its
				// first kickoff.
				sublabel: `${start.toFormat("LLL d").toUpperCase()} – ${end.toFormat("LLL d").toUpperCase()}`,
				gameCount: row.n,
				// ESPN's own week boundaries where they're synced (see seasonWeeks
				// in db/schema/games.ts), pulled back a day to Tuesday 3am ET -
				// once Monday Night Football is over the week is done, so the
				// Tuesday after it belongs to the next week. Still contiguous, so
				// mid-season there's always exactly one window holding "now".
				// Falls back to the span of the week's own games for a week ESPN
				// hasn't published boundaries for, which does leave a gap between
				// weeks - better than a window with no range at all.
				rangeStart: row.week_starts
					? weekBoundary(row.week_starts)
					: start.startOf("day").toJSDate(),
				rangeEnd: row.week_ends
					? weekBoundary(row.week_ends)
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
		const key = day.toFormat("yyyy-LL-dd")
		return {
			key,
			scope: { kind: "day" as const, day: key },
			label: day.toFormat("ccc LLL d").toUpperCase(),
			sublabel: null,
			gameCount: row.n,
			rangeStart: day.startOf("day").toJSDate(),
			rangeEnd: day.endOf("day").toJSDate(),
		}
	})
}

// The window a url-supplied key names, or null if it names none. Null is the
// permalink's 404 and the only case a report card can't be built for: a key
// that matches no window has no label to put in "no calls for ...", which
// every other empty case does have. parseWindowKey rejects a malformed key
// before this touches the database at all.
export async function resolveWindowByKey(
	league: League,
	key: string,
): Promise<WindowDescriptor | null> {
	if (!parseWindowKey(key)) return null
	const windows = await getLeagueWindows(league)
	return windows.find((window) => window.key === key) ?? null
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
