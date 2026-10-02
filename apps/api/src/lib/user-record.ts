import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import { and, desc, inArray } from "drizzle-orm"
import { DateTime } from "luxon"
import { db } from "../db"
import { type League, playerGameStats, type Team } from "../db/schema"
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
	// The one team this call is about, or null when it's about no single team.
	// See callTeamId.
	teamId: string | null
}

export type UserRecordInputs = {
	calls: RecordCall[]
	leagues: League[]
	// Every team some call is about.
	teams: Team[]
	// Streak and sweep awards, which belong to no call. Keyed by league id.
	bonusByLeague: Map<string, number>
}

// What a call is about, before a player is placed on a team.
type Subject = { kind: "team"; id: string } | { kind: "player"; id: string }

// The question's own subject when it has one, otherwise each pick's team or
// player. Null for a call with a pick of neither (Over, Yes) or no picks at
// all, so a game total or a subject-less prop lands on no team rather than
// counting toward both.
function callSubjects(
	question: { subjectTeamId: string | null; subjectPlayerId: string | null },
	selections: {
		option: { teamId: string | null; playerId: string | null } | null
	}[],
): Subject[] | null {
	if (question.subjectTeamId)
		return [{ kind: "team", id: question.subjectTeamId }]
	if (question.subjectPlayerId)
		return [{ kind: "player", id: question.subjectPlayerId }]
	const subjects: Subject[] = []
	for (const { option } of selections) {
		if (option?.teamId) subjects.push({ kind: "team", id: option.teamId })
		else if (option?.playerId)
			subjects.push({ kind: "player", id: option.playerId })
		else return null
	}
	return subjects.length > 0 ? subjects : null
}

const pairKey = (a: string, b: string) => `${a}|${b}`

type PlayerLookup = {
	playerId: string
	gameId: string | null
	seasonId: string
}

// Which team a player was on for a call: their box score row for the call's
// game, or for a call on no game their latest one that season, so a traded
// player's old calls stay with the team they were on. A player with no box
// score in either falls back to their current team.
async function loadPlayerTeams(
	lookups: PlayerLookup[],
): Promise<(lookup: PlayerLookup) => string | null> {
	const playerIds = [...new Set(lookups.map((l) => l.playerId))]
	if (playerIds.length === 0) return () => null
	const gameIds = [
		...new Set(lookups.flatMap((l) => (l.gameId ? [l.gameId] : []))),
	]
	const seasonIds = [
		...new Set(lookups.flatMap((l) => (l.gameId ? [] : [l.seasonId]))),
	]

	const [byGame, bySeason, players] = await Promise.all([
		gameIds.length
			? db
					.selectDistinct({
						gameId: playerGameStats.gameId,
						playerId: playerGameStats.playerId,
						teamId: playerGameStats.teamId,
					})
					.from(playerGameStats)
					.where(
						and(
							inArray(playerGameStats.gameId, gameIds),
							inArray(playerGameStats.playerId, playerIds),
						),
					)
			: [],
		seasonIds.length
			? db
					.selectDistinctOn(
						[playerGameStats.playerId, playerGameStats.seasonId],
						{
							playerId: playerGameStats.playerId,
							seasonId: playerGameStats.seasonId,
							teamId: playerGameStats.teamId,
						},
					)
					.from(playerGameStats)
					.where(
						and(
							inArray(playerGameStats.seasonId, seasonIds),
							inArray(playerGameStats.playerId, playerIds),
						),
					)
					.orderBy(
						playerGameStats.playerId,
						playerGameStats.seasonId,
						desc(playerGameStats.gameDate),
					)
			: [],
		db.query.players.findMany({
			where: { id: { in: playerIds } },
			columns: { id: true, currentTeamId: true },
		}),
	])

	const gameTeam = new Map(
		byGame.map((row) => [pairKey(row.gameId, row.playerId ?? ""), row.teamId]),
	)
	const seasonTeam = new Map(
		bySeason.map((row) => [
			pairKey(row.seasonId, row.playerId ?? ""),
			row.teamId,
		]),
	)
	const currentTeam = new Map(players.map((p) => [p.id, p.currentTeamId]))
	return ({ playerId, gameId, seasonId }) =>
		(gameId
			? gameTeam.get(pairKey(gameId, playerId))
			: seasonTeam.get(pairKey(seasonId, playerId))) ??
		currentTeam.get(playerId) ??
		null
}

// The one team a call is about, once its players are placed on teams. Null
// when it has no subject, a player on no known team, or subjects that land
// on different teams, like award picks from three rosters.
function callTeamId(
	subjects: Subject[] | null,
	playerTeam: (playerId: string) => string | null,
): string | null {
	if (!subjects) return null
	const teamIds = new Set(
		subjects.map((s) => (s.kind === "team" ? s.id : playerTeam(s.id))),
	)
	const [teamId] = teamIds
	return teamIds.size === 1 && teamId ? teamId : null
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
						option: {
							columns: {
								isCorrect: true,
								lossRate: true,
								teamId: true,
								playerId: true,
							},
						},
					},
				},
				question: {
					columns: {
						leagueId: true,
						seasonId: true,
						subjectTeamId: true,
						subjectPlayerId: true,
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

	const subjectsByCall = new Map<string, Subject[] | null>()
	const playerLookups: PlayerLookup[] = []
	for (const row of rows) {
		const question = row.question
		if (!question) continue
		const subjects = callSubjects(question, row.selections)
		subjectsByCall.set(row.id, subjects)
		for (const subject of subjects ?? []) {
			if (subject.kind !== "player") continue
			playerLookups.push({
				playerId: subject.id,
				gameId: question.gameId,
				seasonId: question.seasonId,
			})
		}
	}
	const playerTeam = await loadPlayerTeams(playerLookups)

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
			teamId: callTeamId(subjectsByCall.get(row.id) ?? null, (playerId) =>
				playerTeam({
					playerId,
					gameId: question.gameId,
					seasonId: question.seasonId,
				}),
			),
		})
	}

	const teamIds = [
		...new Set(calls.flatMap((call) => (call.teamId ? [call.teamId] : []))),
	]
	const teams = teamIds.length
		? await db.query.teams.findMany({ where: { id: { in: teamIds } } })
		: []

	const bonusByLeague = new Map<string, number>()
	for (const award of awards) {
		bonusByLeague.set(
			award.leagueId,
			(bonusByLeague.get(award.leagueId) ?? 0) + award.points,
		)
	}

	return { calls, leagues, teams, bonusByLeague }
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

// Null team is the row for calls about no single team.
export type RecordTeamRow = ReportCardStats & { team: Team | null }

export type UserRecord = {
	calendar: RecordCalendar
	// One row per league, best net first. Only meaningful unscoped: scoped to
	// one league it would be a single row restating the totals.
	byLeague: RecordLeagueRow[]
	byFamily: ReportCard["byFamily"]
	byShape: ReportCard["byShape"]
	// One row per team, best net first, then the row for calls about no single
	// team. Each call is in exactly one row, so they add up to netFromCalls the
	// same way the family rows do.
	byTeam: RecordTeamRow[]
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

	const teamsById = new Map(inputs.teams.map((team) => [team.id, team]))
	const byTeam: RecordTeamRow[] = []
	for (const [id, teamCalls] of groupBy(calls, (call) => call.teamId)) {
		const team = id ? teamsById.get(id) : null
		const teamCard = buildReportCard(teamCalls)
		if (team === undefined || teamCard.settledCount === 0) continue
		byTeam.push({ ...statsOf(teamCard), team })
	}
	byTeam.sort(
		(a, b) =>
			Number(a.team === null) - Number(b.team === null) ||
			b.netPoints - a.netPoints ||
			(a.team?.name ?? "").localeCompare(b.team?.name ?? ""),
	)

	const bonusPoints = leagueId
		? (inputs.bonusByLeague.get(leagueId) ?? 0)
		: [...inputs.bonusByLeague.values()].reduce((sum, n) => sum + n, 0)

	return {
		calendar: buildCalendar(calls, leaguesById, calendarRange(now, weeks)),
		byLeague,
		byFamily: card.byFamily.filter((row) => row.settledCount > 0),
		byShape: card.byShape.filter((row) => row.settledCount > 0),
		byTeam,
		wins: card.wins,
		losses: card.losses,
		returnPct: card.returnPct,
		netFromCalls: card.netPoints,
		bonusPoints,
	}
}
