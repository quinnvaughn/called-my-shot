import { and, eq, gte, notInArray } from "drizzle-orm"
import { db } from "../../db"
import {
	leagues,
	seasonPuzzles,
	type TeamSeason,
	teamSeasons,
} from "../../db/schema"
import { FILL_SEASON_SCHEDULE_LOCK } from "../job-lock"
import { runCli } from "../run-cli"
import { isSeasonLeague } from "./archive-parse"
import { seasonClues } from "./clues"
import { addSeasonPuzzleDays, seasonPuzzleDay } from "./day"

// How far ahead the schedule is kept full, so the admin page shows what's
// coming well before it runs.
export const SEASON_SCHEDULE_AHEAD_DAYS = 14
// A franchise isn't the answer again within this many days of another run.
export const SEASON_TEAM_REST_DAYS = 30

type Scheduled = { day: string; leagueId: string; teamId: string }
type Candidate = { id: string; leagueId: string; teamId: string }

function dayDistance(a: string, b: string): number {
	return (
		(Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000
	)
}

function teamRested(
	scheduled: Iterable<Scheduled>,
	teamId: string,
	day: string,
) {
	for (const s of scheduled) {
		if (
			s.teamId === teamId &&
			Math.abs(dayDistance(s.day, day)) < SEASON_TEAM_REST_DAYS
		) {
			return false
		}
	}
	return true
}

// A random season from `pool` that can run on `day`: from `leagueId` when
// given, and never a franchise within SEASON_TEAM_REST_DAYS of another run.
export function pickSeason(
	pool: readonly Candidate[],
	scheduled: Iterable<Scheduled>,
	day: string,
	random: () => number,
	leagueId?: string,
): Candidate | null {
	const list = [...scheduled]
	const ready = pool.filter(
		(c) =>
			(!leagueId || c.leagueId === leagueId) && teamRested(list, c.teamId, day),
	)
	if (ready.length === 0) return null
	return ready[Math.floor(random() * ready.length)] ?? null
}

// Assigns seasons from `pool` (never run before) to the empty days from
// `today` through the next SEASON_SCHEDULE_AHEAD_DAYS. Pure, so the rotation
// rules are testable:
// - leagues take turns: the one that ran longest ago goes next;
// - a league doesn't run two days in a row while another can;
// - within a league the season is random;
// - a franchise doesn't come back within SEASON_TEAM_REST_DAYS.
export function planSeasonSchedule(
	today: string,
	scheduled: Scheduled[],
	pool: Candidate[],
	random: () => number = Math.random,
): { teamSeasonId: string; day: string }[] {
	const byDay = new Map(scheduled.map((s) => [s.day, s]))
	const remaining = [...pool]
	const plan: { teamSeasonId: string; day: string }[] = []
	const leagueIds = [...new Set(pool.map((c) => c.leagueId))].sort()

	const lastRun = (leagueId: string, before: string) => {
		let last = ""
		for (const s of byDay.values()) {
			if (s.leagueId === leagueId && s.day < before && s.day > last) {
				last = s.day
			}
		}
		return last
	}

	for (let offset = 0; offset < SEASON_SCHEDULE_AHEAD_DAYS; offset++) {
		const day = addSeasonPuzzleDays(today, offset)
		if (byDay.has(day)) continue
		const yesterday = byDay.get(addSeasonPuzzleDays(day, -1))?.leagueId
		const order = [...leagueIds].sort(
			(a, b) =>
				Number(a === yesterday) - Number(b === yesterday) ||
				lastRun(a, day).localeCompare(lastRun(b, day)),
		)
		let pick: Candidate | null = null
		for (const leagueId of order) {
			pick = pickSeason(remaining, byDay.values(), day, random, leagueId)
			if (pick) break
		}
		if (!pick) continue
		remaining.splice(remaining.indexOf(pick), 1)
		byDay.set(day, { day, leagueId: pick.leagueId, teamId: pick.teamId })
		plan.push({ teamSeasonId: pick.id, day })
	}
	return plan
}

// The seasons that can still be scheduled: in an active league, archived as
// puzzle-ready, never run, and with leaders that make six clues. Each comes
// with its clues.
export async function schedulableSeasons(
	leagueId?: string,
): Promise<Map<string, { season: TeamSeason; clues: string[] }>> {
	const used = db.select({ id: seasonPuzzles.teamSeasonId }).from(seasonPuzzles)
	const rows = await db
		.select({ season: teamSeasons, slug: leagues.slug })
		.from(teamSeasons)
		.innerJoin(leagues, eq(leagues.id, teamSeasons.leagueId))
		.where(
			and(
				eq(leagues.status, "active"),
				eq(teamSeasons.puzzleReady, true),
				notInArray(teamSeasons.id, used),
				leagueId ? eq(teamSeasons.leagueId, leagueId) : undefined,
			),
		)
	const found = new Map<string, { season: TeamSeason; clues: string[] }>()
	for (const { season, slug } of rows) {
		if (!isSeasonLeague(slug)) continue
		const clues = seasonClues(slug, season)
		if (clues) found.set(season.id, { season, clues })
	}
	return found
}

// What's scheduled from SEASON_TEAM_REST_DAYS ago on, for the rest rule.
export async function recentSchedule(today: string): Promise<Scheduled[]> {
	return db
		.select({
			day: seasonPuzzles.playDate,
			leagueId: teamSeasons.leagueId,
			teamId: teamSeasons.teamId,
		})
		.from(seasonPuzzles)
		.innerJoin(teamSeasons, eq(teamSeasons.id, seasonPuzzles.teamSeasonId))
		.where(
			gte(
				seasonPuzzles.playDate,
				addSeasonPuzzleDays(today, -SEASON_TEAM_REST_DAYS),
			),
		)
}

export async function fillSeasonSchedule(now = new Date()) {
	const today = seasonPuzzleDay(now)
	const [scheduled, pool] = await Promise.all([
		recentSchedule(today),
		schedulableSeasons(),
	])
	const plan = planSeasonSchedule(
		today,
		scheduled,
		[...pool.values()].map(({ season }) => ({
			id: season.id,
			leagueId: season.leagueId,
			teamId: season.teamId,
		})),
	)
	for (const { teamSeasonId, day } of plan) {
		const entry = pool.get(teamSeasonId)
		if (!entry) continue
		await db
			.insert(seasonPuzzles)
			.values({ teamSeasonId, clues: entry.clues, playDate: day })
			.onConflictDoNothing()
	}
	return { scheduled: plan.length }
}

runCli(
	import.meta.url,
	async () => {
		const { scheduled } = await fillSeasonSchedule()
		console.log(`Scheduled ${scheduled} Name That Season puzzles.`)
	},
	{ lock: FILL_SEASON_SCHEDULE_LOCK },
)
