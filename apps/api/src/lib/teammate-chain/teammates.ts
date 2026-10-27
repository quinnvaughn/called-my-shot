import { and, eq, inArray, isNotNull, or } from "drizzle-orm"
import { db } from "../../db"
import {
	players,
	playerTeamSeasons,
	type Team,
	teamSeasons,
	teams,
} from "../../db/schema"
import { type SeasonLeague, seasonLabel } from "../season-puzzles/archive-parse"
import type { Linked } from "./play"

// Two players are teammates when they share a player_team_seasons row's
// franchise and season, or when both are on the same roster today: the
// history ingest runs after each season, so this season's new teammates
// only show up through current rosters until then.

type SeasonRow = { playerId: string; teamId: string; season: number }

async function seasonRowsOf(playerIds: string[]): Promise<SeasonRow[]> {
	if (playerIds.length === 0) return []
	return db
		.select({
			playerId: playerTeamSeasons.playerId,
			teamId: playerTeamSeasons.teamId,
			season: playerTeamSeasons.season,
		})
		.from(playerTeamSeasons)
		.where(inArray(playerTeamSeasons.playerId, playerIds))
}

async function currentTeamsOf(
	playerIds: string[],
): Promise<Map<string, string>> {
	if (playerIds.length === 0) return new Map()
	const rows = await db
		.select({ id: players.id, teamId: players.currentTeamId })
		.from(players)
		.where(
			and(inArray(players.id, playerIds), isNotNull(players.currentTeamId)),
		)
	return new Map(rows.map((row) => [row.id, row.teamId as string]))
}

const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`)

// Which of `playerIds` were teammates with which, for judging a game's picks.
export async function loadChainLinks(playerIds: string[]): Promise<Linked> {
	const ids = [...new Set(playerIds)]
	const [rows, current] = await Promise.all([
		seasonRowsOf(ids),
		currentTeamsOf(ids),
	])
	const byTeamSeason = new Map<string, string[]>()
	for (const row of rows) {
		const key = `${row.teamId}:${row.season}`
		byTeamSeason.set(key, [...(byTeamSeason.get(key) ?? []), row.playerId])
	}
	for (const [playerId, teamId] of current) {
		const key = `${teamId}:now`
		byTeamSeason.set(key, [...(byTeamSeason.get(key) ?? []), playerId])
	}
	const pairs = new Set<string>()
	for (const roster of byTeamSeason.values()) {
		for (const a of roster) {
			for (const b of roster) if (a !== b) pairs.add(pairKey(a, b))
		}
	}
	return (a, b) => pairs.has(pairKey(a, b))
}

// Which of `playerIds` ever played in the league, by a season with one of its
// franchises or a spot on one of its rosters today.
export async function playersInLeague(
	leagueId: string,
	playerIds: string[],
): Promise<Set<string>> {
	const ids = [...new Set(playerIds)]
	if (ids.length === 0) return new Set()
	const [past, current] = await Promise.all([
		db
			.selectDistinct({ id: playerTeamSeasons.playerId })
			.from(playerTeamSeasons)
			.innerJoin(teams, eq(teams.id, playerTeamSeasons.teamId))
			.where(
				and(
					eq(teams.leagueId, leagueId),
					inArray(playerTeamSeasons.playerId, ids),
				),
			),
		db
			.select({ id: players.id })
			.from(players)
			.innerJoin(teams, eq(teams.id, players.currentTeamId))
			.where(and(eq(teams.leagueId, leagueId), inArray(players.id, ids))),
	])
	return new Set([...past, ...current].map((row) => row.id))
}

// What two neighbors in a chain shared: a franchise, what it was called in
// the last of those seasons, and when, as "1997-98" or "1995-96 to 1997-98".
// `current` when it's today's roster that makes them teammates.
export type ChainLinkDetail = {
	team: Team
	name: string
	label: string
	current: boolean
}

// "2004" or "1995-96", and a run of seasons in a row as "1996 to 1998".
export function sharedSeasonsLabel(
	league: SeasonLeague,
	seasons: readonly number[],
): string {
	const sorted = [...new Set(seasons)].sort((a, b) => a - b)
	const runs: [number, number][] = []
	for (const season of sorted) {
		const run = runs.at(-1)
		if (run && season === run[1] + 1) run[1] = season
		else runs.push([season, season])
	}
	return runs
		.map(([first, last]) =>
			first === last
				? seasonLabel(league, first)
				: `${seasonLabel(league, first)} to ${seasonLabel(league, last)}`,
		)
		.join(", ")
}

// For each neighboring pair in `route` (start, middle players, target), what
// they shared. The most recent franchise first when there's more than one.
export async function loadChainLinkDetails(
	league: SeasonLeague,
	route: readonly string[],
): Promise<ChainLinkDetail[][]> {
	const ids = [...new Set(route)]
	const [rows, current] = await Promise.all([
		seasonRowsOf(ids),
		currentTeamsOf(ids),
	])
	const seasonsOf = new Map<string, Map<string, Set<number>>>()
	for (const row of rows) {
		const byTeam = seasonsOf.get(row.playerId) ?? new Map()
		const set = byTeam.get(row.teamId) ?? new Set<number>()
		set.add(row.season)
		byTeam.set(row.teamId, set)
		seasonsOf.set(row.playerId, byTeam)
	}

	type Shared = { teamId: string; seasons: number[]; current: boolean }
	const pairs: Shared[][] = []
	for (let i = 0; i + 1 < route.length; i++) {
		const a = route[i] as string
		const b = route[i + 1] as string
		const shared: Shared[] = []
		const theirs = seasonsOf.get(b) ?? new Map<string, Set<number>>()
		for (const [teamId, mine] of seasonsOf.get(a) ?? []) {
			const both = [...mine].filter((s) => theirs.get(teamId)?.has(s))
			if (both.length > 0) {
				shared.push({ teamId, seasons: both, current: false })
			}
		}
		const now = current.get(a)
		if (
			now &&
			now === current.get(b) &&
			!shared.some((s) => s.teamId === now)
		) {
			shared.push({ teamId: now, seasons: [], current: true })
		}
		shared.sort(
			(x, y) =>
				Number(y.current) - Number(x.current) ||
				Math.max(...y.seasons) - Math.max(...x.seasons),
		)
		pairs.push(shared)
	}

	const teamIds = [...new Set(pairs.flat().map((s) => s.teamId))]
	const lastSeasons = pairs
		.flat()
		.filter((s) => !s.current)
		.map((s) => ({ teamId: s.teamId, year: Math.max(...s.seasons) }))
	const [teamRows, nameRows] = await Promise.all([
		teamIds.length
			? db.select().from(teams).where(inArray(teams.id, teamIds))
			: [],
		lastSeasons.length
			? db
					.select({
						teamId: teamSeasons.teamId,
						year: teamSeasons.year,
						name: teamSeasons.name,
					})
					.from(teamSeasons)
					.where(
						or(
							...lastSeasons.map((s) =>
								and(
									eq(teamSeasons.teamId, s.teamId),
									eq(teamSeasons.year, s.year),
								),
							),
						),
					)
			: [],
	])
	const teamsById = new Map(teamRows.map((team) => [team.id, team]))
	const nameOf = new Map(
		nameRows.map((row) => [`${row.teamId}:${row.year}`, row.name]),
	)

	return pairs.map((shared) =>
		shared.flatMap((s) => {
			const team = teamsById.get(s.teamId)
			if (!team) return []
			const last = Math.max(...s.seasons)
			return [
				{
					team,
					name: s.current
						? team.name
						: (nameOf.get(`${s.teamId}:${last}`) ?? team.name),
					label: s.current
						? "This season"
						: sharedSeasonsLabel(league, s.seasons),
					current: s.current,
				},
			]
		}),
	)
}

// "1988-98, 2004", a run of seasons in a row as its first and last year.
// The years are the ones the league's seasons are stored by, the year an NBA
// or NHL season ends in, the same as a player's years beside his name.
export function compactYears(seasons: readonly number[]): string {
	const sorted = [...new Set(seasons)].sort((a, b) => a - b)
	const runs: [number, number][] = []
	for (const season of sorted) {
		const run = runs.at(-1)
		if (run && season === run[1] + 1) run[1] = season
		else runs.push([season, season])
	}
	return runs
		.map(([first, last]) => {
			if (first === last) return String(first)
			const sameCentury = Math.floor(first / 100) === Math.floor(last / 100)
			return `${first}-${sameCentury ? String(last).slice(-2) : last}`
		})
		.join(", ")
}

// One team a player played for, under what it was called then: a franchise
// that moved or was renamed (the Sonics, now the Thunder) is one entry per
// name, where the archive knows the name.
export type ChainPlayerTeam = { team: Team; name: string; years: string }

// Every team each player played for in the league, in the order he got
// there.
export async function loadPlayerTeams(
	leagueId: string,
	playerIds: readonly string[],
): Promise<Map<string, ChainPlayerTeam[]>> {
	const ids = [...new Set(playerIds)]
	if (ids.length === 0) return new Map()
	const rows = await db
		.select({
			playerId: playerTeamSeasons.playerId,
			season: playerTeamSeasons.season,
			team: teams,
		})
		.from(playerTeamSeasons)
		.innerJoin(teams, eq(teams.id, playerTeamSeasons.teamId))
		.where(
			and(
				eq(teams.leagueId, leagueId),
				inArray(playerTeamSeasons.playerId, ids),
			),
		)
	const teamIds = [...new Set(rows.map((row) => row.team.id))]
	const names = teamIds.length
		? await db
				.select({
					teamId: teamSeasons.teamId,
					year: teamSeasons.year,
					name: teamSeasons.name,
				})
				.from(teamSeasons)
				.where(inArray(teamSeasons.teamId, teamIds))
		: []
	const nameOf = new Map(
		names.map((row) => [`${row.teamId}:${row.year}`, row.name]),
	)

	type Entry = { team: Team; name: string; seasons: number[] }
	const byPlayer = new Map<string, Map<string, Entry>>()
	for (const row of rows) {
		const name = nameOf.get(`${row.team.id}:${row.season}`) ?? row.team.name
		const entries = byPlayer.get(row.playerId) ?? new Map<string, Entry>()
		const key = `${row.team.id}:${name}`
		const entry = entries.get(key) ?? { team: row.team, name, seasons: [] }
		entry.seasons.push(row.season)
		entries.set(key, entry)
		byPlayer.set(row.playerId, entries)
	}
	return new Map(
		[...byPlayer].map(([playerId, entries]) => [
			playerId,
			[...entries.values()]
				.sort((a, b) => Math.min(...a.seasons) - Math.min(...b.seasons))
				.map((entry) => ({
					team: entry.team,
					name: entry.name,
					years: compactYears(entry.seasons),
				})),
		]),
	)
}
