import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import { DateTime } from "luxon"
import { match, P } from "ts-pattern"
import type { Game, League } from "../../db/schema"
import { SLOT_LABELS_BY_LEAGUE } from "../../db/sync/slot-labels"

// A slate is the group of games a sweep is counted over: one broadcast slot
// of one week for a week-window league (NFL's Sunday Early), or one ET
// calendar day for a date-window league (MLB, NBA). A week-league game with no
// slot - synced before slots existed, or entered by hand - falls back to its
// ET day within that week rather than joining a slot it may not belong to.
export type ParsedSlateKey =
	| { kind: "day"; day: string }
	| {
			kind: "week_slot"
			seasonYear: number
			seasonType: Game["seasonType"]
			weekNumber: number
			slot: string
	  }
	| {
			kind: "week_day"
			seasonYear: number
			seasonType: Game["seasonType"]
			weekNumber: number
			day: string
	  }

// Exported so the Games tab's window key spells a season type the same way a
// slate key does - both end up in a url segment a person can read, and
// "2026-reg-w3" meaning one thing in a sweep link and another in a window
// link would be its own small bug.
export const SEASON_TYPE_CODE: Record<Game["seasonType"], string> = {
	regular: "reg",
	postseason: "post",
}

export function etDay(at: Date): string {
	return DateTime.fromJSDate(at, { zone: SPORTS_TIME_ZONE }).toISODate() ?? ""
}

// URL-safe, since it's a path segment on the sweep page and its card:
// "2026-09-14", "2026-reg-w3-sun-early", "2026-reg-w3-2026-09-20".
// seasonYear is seasons.year, unique within a league.
export function buildSlateKey(
	game: Pick<Game, "startsAt" | "seasonType" | "weekNumber" | "slot">,
	windowType: League["windowType"],
	seasonYear: number,
): string {
	const day = etDay(game.startsAt)
	if (windowType === "date" || game.weekNumber === null) return day
	const week = `${seasonYear}-${SEASON_TYPE_CODE[game.seasonType]}-w${game.weekNumber}`
	return game.slot
		? `${week}-${game.slot.toLowerCase().replaceAll("_", "-")}`
		: `${week}-${day}`
}

const DAY_KEY = /^(\d{4}-\d{2}-\d{2})$/
const WEEK_DAY_KEY = /^(\d{4})-(reg|post)-w(\d+)-(\d{4}-\d{2}-\d{2})$/
const WEEK_SLOT_KEY = /^(\d{4})-(reg|post)-w(\d+)-([a-z0-9-]+)$/

export const seasonTypeFromCode = (code: string): Game["seasonType"] =>
	code === "post" ? "postseason" : "regular"

export function parseSlateKey(key: string): ParsedSlateKey | null {
	const day = DAY_KEY.exec(key)
	if (day?.[1]) return { kind: "day", day: day[1] }

	const weekDay = WEEK_DAY_KEY.exec(key)
	if (weekDay?.[1] && weekDay[2] && weekDay[3] && weekDay[4]) {
		return {
			kind: "week_day",
			seasonYear: Number(weekDay[1]),
			seasonType: seasonTypeFromCode(weekDay[2]),
			weekNumber: Number(weekDay[3]),
			day: weekDay[4],
		}
	}

	const weekSlot = WEEK_SLOT_KEY.exec(key)
	if (weekSlot?.[1] && weekSlot[2] && weekSlot[3] && weekSlot[4]) {
		return {
			kind: "week_slot",
			seasonYear: Number(weekSlot[1]),
			seasonType: seasonTypeFromCode(weekSlot[2]),
			weekNumber: Number(weekSlot[3]),
			slot: weekSlot[4].toUpperCase().replaceAll("-", "_"),
		}
	}
	return null
}

// The half-open [start, end) instants an ET calendar day covers.
export function slateDayRange(day: string): { start: Date; end: Date } {
	const start = DateTime.fromISO(day, { zone: SPORTS_TIME_ZONE }).startOf("day")
	return { start: start.toJSDate(), end: start.plus({ days: 1 }).toJSDate() }
}

const titleCase = (label: string) =>
	label
		.toLowerCase()
		.split(" ")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ")

// "Week 3 Sunday Early", "Postseason Week 1 Saturday", "Sep 14". Reads after
// the league's abbreviation: "NFL Week 3 Sunday Early".
export function formatSlateLabel(
	slate: ParsedSlateKey,
	leagueSlug: string,
): string {
	const week = (seasonType: Game["seasonType"], weekNumber: number) =>
		`${seasonType === "postseason" ? "Postseason " : ""}Week ${weekNumber}`
	return match(slate)
		.with({ kind: "day" }, ({ day }) =>
			DateTime.fromISO(day, { zone: SPORTS_TIME_ZONE }).toFormat("LLL d"),
		)
		.with({ kind: "week_slot", slot: P.string }, (s) => {
			const label = SLOT_LABELS_BY_LEAGUE[leagueSlug]?.[s.slot] ?? s.slot
			return `${week(s.seasonType, s.weekNumber)} ${titleCase(label.replaceAll("_", " "))}`
		})
		.with(
			{ kind: "week_day" },
			(s) =>
				`${week(s.seasonType, s.weekNumber)} ${DateTime.fromISO(s.day, { zone: SPORTS_TIME_ZONE }).toFormat("cccc")}`,
		)
		.exhaustive()
}
