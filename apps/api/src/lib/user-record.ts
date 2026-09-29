import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import { DateTime } from "luxon"
import { db } from "../db"
import type { League } from "../db/schema"
import {
	buildReportCard,
	type ReportCard,
	type ReportCardCall,
	type ReportCardStats,
} from "./report-card/compute"
import { toReportCardCall } from "./report-card/load"
import { etDay } from "./streaks/slate"
import { buildWeekWindowKey } from "./windows"

// A profile's track record: the results calendar and the "where the points
// come from" breakdown. Both are folds of the same calls through
// buildReportCard, so a calendar day and its report card can't disagree about
// how that day went.

export type RecordCall = ReportCardCall & {
	leagueId: string
	// The ET day this call belongs to on the calendar: its game's day, or for
	// a question spanning no game, the day it resolved. Null for an open
	// gameless call, which has no day yet.
	day: string | null
	// The report card window the day links to - the day itself for a date
	// league, the week key for a week league. Null when the call has no game
	// to place it in a window.
	windowKey: string | null
}

export type UserRecordInputs = {
	calls: RecordCall[]
	leagues: League[]
	// Streak and sweep awards, which belong to no call. Keyed by league id.
	bonusByLeague: Map<string, number>
}

export async function loadUserRecordInputs(
	userId: string,
): Promise<UserRecordInputs> {
	const [rows, awards] = await Promise.all([
		db.query.calls.findMany({
			where: { userId },
			columns: {
				id: true,
				conviction: true,
				hitTolerance: true,
				resultPoints: true,
				unscoredReason: true,
				createdAt: true,
			},
			with: {
				selections: {
					columns: { conviction: true, resultPoints: true },
					with: {
						option: { columns: { isCorrect: true, lossRate: true } },
					},
				},
				question: {
					columns: {
						leagueId: true,
						gameId: true,
						shape: true,
						status: true,
						lossRate: true,
						resolvedAt: true,
					},
					with: {
						game: {
							columns: { startsAt: true, seasonType: true, weekNumber: true },
							with: { season: { columns: { year: true } } },
						},
					},
				},
			},
		}),
		db.query.pointAwards.findMany({
			where: { userId },
			columns: { leagueId: true, points: true },
		}),
	])

	const leagueIds = [
		...new Set(
			rows.flatMap((row) =>
				row.question?.leagueId ? [row.question.leagueId] : [],
			),
		),
	]
	const leagues = leagueIds.length
		? await db.query.leagues.findMany({ where: { id: { in: leagueIds } } })
		: []
	const leaguesById = new Map(leagues.map((league) => [league.id, league]))

	const calls: RecordCall[] = []
	for (const row of rows) {
		const question = row.question
		const league = question?.leagueId
			? leaguesById.get(question.leagueId)
			: undefined
		if (!question || !league) continue
		const game = question.game
		const day = game
			? etDay(game.startsAt)
			: question.resolvedAt
				? etDay(question.resolvedAt)
				: null
		const windowKey = !game
			? null
			: league.windowType === "date"
				? etDay(game.startsAt)
				: game.weekNumber !== null && game.season
					? buildWeekWindowKey(
							game.season.year,
							game.seasonType,
							game.weekNumber,
						)
					: null
		calls.push({
			...toReportCardCall(question, row),
			leagueId: league.id,
			day,
			windowKey,
		})
	}

	const bonusByLeague = new Map<string, number>()
	for (const award of awards) {
		bonusByLeague.set(
			award.leagueId,
			(bonusByLeague.get(award.leagueId) ?? 0) + award.points,
		)
	}

	return { calls, leagues, bonusByLeague }
}

export type RecordDayLeague = ReportCardStats & {
	league: League
	windowKey: string | null
}

export type RecordDay = ReportCardStats & {
	day: string
	grade: ReportCard["grade"]
	leagues: RecordDayLeague[]
}

export type RecordCalendar = {
	// Always a Sunday, so the grid's columns are whole weeks.
	startDay: string
	// Today, ET. The grid stops here rather than running to Saturday.
	endDay: string
	activeDays: number
	callCount: number
	// Only days with at least one settled or pending call. The client fills
	// the rest.
	days: RecordDay[]
}

export type RecordLeagueRow = ReportCardStats & { league: League }

export type UserRecord = {
	calendar: RecordCalendar
	// One row per league, best net first. Only meaningful unscoped: scoped to
	// one league it would be a single row restating the totals.
	byLeague: RecordLeagueRow[]
	byFamily: ReportCard["byFamily"]
	byShape: ReportCard["byShape"]
	wins: number
	losses: number
	returnPct: number | null
	netFromCalls: number
	bonusPoints: number
}

const hasCalls = (stats: ReportCardStats) =>
	stats.settledCount + stats.pendingCount > 0

function groupBy<K, T>(items: T[], key: (item: T) => K): Map<K, T[]> {
	const groups = new Map<K, T[]>()
	for (const item of items) {
		const k = key(item)
		const existing = groups.get(k)
		if (existing) existing.push(item)
		else groups.set(k, [item])
	}
	return groups
}

// The Sunday that starts the grid: the current week plus weeks-1 before it.
export function calendarRange(
	now: Date,
	weeks: number,
): { startDay: string; endDay: string } {
	const today = DateTime.fromJSDate(now, { zone: SPORTS_TIME_ZONE }).startOf(
		"day",
	)
	// luxon weekdays run Monday 1 to Sunday 7.
	const sunday = today.minus({ days: today.weekday % 7 })
	const start = sunday.minus({ weeks: weeks - 1 })
	return { startDay: start.toISODate() ?? "", endDay: today.toISODate() ?? "" }
}

function buildCalendar(
	calls: RecordCall[],
	leaguesById: Map<string, League>,
	range: { startDay: string; endDay: string },
): RecordCalendar {
	// ISO dates compare correctly as strings.
	const inRange = calls.filter(
		(call): call is RecordCall & { day: string } =>
			call.day !== null &&
			call.day >= range.startDay &&
			call.day <= range.endDay,
	)

	const days: RecordDay[] = []
	for (const [day, dayCalls] of groupBy(inRange, (call) => call.day)) {
		const card = buildReportCard(dayCalls)
		if (!hasCalls(card)) continue
		const leagues: RecordDayLeague[] = []
		for (const [leagueId, leagueCalls] of groupBy(
			dayCalls,
			(call) => call.leagueId,
		)) {
			const league = leaguesById.get(leagueId)
			const leagueCard = buildReportCard(leagueCalls)
			if (!league || !hasCalls(leagueCard)) continue
			leagues.push({
				...statsOf(leagueCard),
				league,
				windowKey:
					leagueCalls.find((call) => call.windowKey)?.windowKey ?? null,
			})
		}
		leagues.sort((a, b) => a.league.name.localeCompare(b.league.name))
		days.push({ ...statsOf(card), day, grade: card.grade, leagues })
	}
	days.sort((a, b) => a.day.localeCompare(b.day))

	return {
		...range,
		activeDays: days.length,
		callCount: days.reduce(
			(sum, day) => sum + day.settledCount + day.pendingCount,
			0,
		),
		days,
	}
}

function statsOf(card: ReportCard): ReportCardStats {
	return {
		settledCount: card.settledCount,
		wins: card.wins,
		losses: card.losses,
		pendingCount: card.pendingCount,
		netPoints: card.netPoints,
		committedPoints: card.committedPoints,
		pendingStake: card.pendingStake,
		returnPct: card.returnPct,
	}
}

// leagueId null is the whole career.
export function buildUserRecord(
	inputs: UserRecordInputs,
	{
		leagueId,
		weeks,
		now,
	}: { leagueId: string | null; weeks: number; now: Date },
): UserRecord {
	const leaguesById = new Map(
		inputs.leagues.map((league) => [league.id, league]),
	)
	const calls = leagueId
		? inputs.calls.filter((call) => call.leagueId === leagueId)
		: inputs.calls
	const card = buildReportCard(calls)

	const byLeague: RecordLeagueRow[] = []
	if (!leagueId) {
		for (const [id, leagueCalls] of groupBy(calls, (call) => call.leagueId)) {
			const league = leaguesById.get(id)
			const leagueCard = buildReportCard(leagueCalls)
			if (!league || leagueCard.settledCount === 0) continue
			byLeague.push({ ...statsOf(leagueCard), league })
		}
		byLeague.sort(
			(a, b) =>
				b.netPoints - a.netPoints || a.league.name.localeCompare(b.league.name),
		)
	}

	const bonusPoints = leagueId
		? (inputs.bonusByLeague.get(leagueId) ?? 0)
		: [...inputs.bonusByLeague.values()].reduce((sum, n) => sum + n, 0)

	return {
		calendar: buildCalendar(calls, leaguesById, calendarRange(now, weeks)),
		byLeague,
		byFamily: card.byFamily.filter((row) => row.settledCount > 0),
		byShape: card.byShape.filter((row) => row.settledCount > 0),
		wins: card.wins,
		losses: card.losses,
		returnPct: card.returnPct,
		netFromCalls: card.netPoints,
		bonusPoints,
	}
}
