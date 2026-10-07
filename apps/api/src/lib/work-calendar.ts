import { db } from "../db"
import type { Game } from "../db/schema"
import { nextAutoResolveGamesAt } from "../db/sync/auto-resolve-games"
import {
	isStartersDue,
	STARTERS_LOOKAHEAD_MS,
} from "../db/sync/sync-game-starters"
import { LOOKBACK_MS as LIVE_LOOKBACK_MS } from "../db/sync/sync-live-scores"
import { REMINDER_LEAD_MINUTES } from "./game-reminders"
import { MINUTE_MS } from "./time"

// What the scheduler knows about upcoming work without asking the database,
// so a tick with nothing to do costs no query at all. Neon only suspends the
// compute after minutes without one, and every query it serves while awake
// is billed by the hour. Reloaded after the jobs that change what it reads
// (see scheduler.ts), never on a timer of its own.

export type CalendarGame = Pick<
	Game,
	"id" | "status" | "startsAt" | "startersSyncedAt" | "finalizedAt"
> & { leagueSlug: string | null }

export type WorkCalendar = {
	games: CalendarGame[]
	// When auto-resolve-games next has a question to read, or null for none.
	nextAutoResolveAt: Date | null
}

// A reminder goes out 60 minutes before its game (see drainGameReminders),
// and one tick of slack keeps the tick before that inside the window too.
const WINDOW_LEAD_MS = (REMINDER_LEAD_MINUTES + 5) * MINUTE_MS

// How long the window stays open after the last game went final: long
// enough for digests to clear SETTLE_MINUTES (lib/email-digest.tsx) and go
// out on a */5 tick.
export const FINAL_TAIL_MS = 30 * MINUTE_MS

// A game about to start, one that may still be in progress (the same
// lookback sync-live-scores scans), or one that went final moments ago. A
// game that never goes final drops out once it's past the lookback, so a
// result ESPN never posts can't hold the window open.
export function inGameWindow(calendar: WorkCalendar, now: Date): boolean {
	const t = now.getTime()
	return calendar.games.some((game) =>
		game.status === "final"
			? game.finalizedAt !== null &&
				t - game.finalizedAt.getTime() <= FINAL_TAIL_MS
			: game.startsAt.getTime() - t <= WINDOW_LEAD_MS &&
				t - game.startsAt.getTime() <= LIVE_LOOKBACK_MS,
	)
}

// The games sync-game-starters would refresh at `now`. A refresh that comes
// back incomplete leaves startersSyncedAt where it was, so `triedAt` - when a
// tick last found the game due - stands in for it: an incomplete game waits
// out the same interval as a complete one rather than reopening every tick.
export function dueStarterGames(
	calendar: WorkCalendar,
	triedAt: ReadonlyMap<string, Date>,
	now: Date,
): CalendarGame[] {
	return calendar.games.filter((game) => {
		if (game.leagueSlug === null) return false
		const tried = triedAt.get(game.id)
		const startersSyncedAt =
			tried && (!game.startersSyncedAt || tried > game.startersSyncedAt)
				? tried
				: game.startersSyncedAt
		return isStartersDue({ ...game, startersSyncedAt }, game.leagueSlug, now)
	})
}

export function isAutoResolveDue(calendar: WorkCalendar, now: Date): boolean {
	return (
		calendar.nextAutoResolveAt !== null && calendar.nextAutoResolveAt <= now
	)
}

export async function loadWorkCalendar(now: Date): Promise<WorkCalendar> {
	const [rows, nextAutoResolveAt] = await Promise.all([
		db.query.games.findMany({
			where: {
				startsAt: {
					gte: new Date(now.getTime() - LIVE_LOOKBACK_MS),
					lte: new Date(
						now.getTime() + Math.max(STARTERS_LOOKAHEAD_MS, WINDOW_LEAD_MS),
					),
				},
			},
			columns: {
				id: true,
				status: true,
				startsAt: true,
				startersSyncedAt: true,
				finalizedAt: true,
			},
			with: { league: { columns: { slug: true } } },
		}),
		nextAutoResolveGamesAt(),
	])
	return {
		games: rows.map(({ league, ...game }) => ({
			...game,
			leagueSlug: league?.slug ?? null,
		})),
		nextAutoResolveAt,
	}
}

// This process's copy. Null until the first load lands, and every gate is
// open while it is, so a machine that can't load one runs every tick the way
// it would without gates.
let current: WorkCalendar | null = null
const startersTriedAt = new Map<string, Date>()
let running: Promise<void> | null = null
let queued: Promise<void> | null = null

// A call made while a load is in flight queues one more after it rather than
// sharing it: the in-flight load may have read before the writes this caller
// just made.
export function refreshWorkCalendar(): Promise<void> {
	if (!running) {
		running = loadWorkCalendar(new Date())
			.then((calendar) => {
				current = calendar
				const ids = new Set(calendar.games.map((game) => game.id))
				for (const id of startersTriedAt.keys()) {
					if (!ids.has(id)) startersTriedAt.delete(id)
				}
			})
			.catch((err) => {
				console.error("[work-calendar] refresh failed:", err)
			})
			.finally(() => {
				running = null
			})
		return running
	}
	queued ??= running.then(() => {
		queued = null
		return refreshWorkCalendar()
	})
	return queued
}

export const workCalendar = {
	inGameWindow: (now: Date) => current === null || inGameWindow(current, now),
	isAutoResolveDue: (now: Date) =>
		current === null || isAutoResolveDue(current, now),
	// True when any game's starters are due, and notes those games as tried.
	takeStartersDue: (now: Date): boolean => {
		if (current === null) return true
		const due = dueStarterGames(current, startersTriedAt, now)
		for (const game of due) startersTriedAt.set(game.id, now)
		return due.length > 0
	},
}

export function setWorkCalendarForTests(calendar: WorkCalendar | null): void {
	current = calendar
	startersTriedAt.clear()
}
