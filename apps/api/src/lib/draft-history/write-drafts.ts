import { and, eq, sql } from "drizzle-orm"
import { db } from "../../db"
import {
	draftEntries,
	externalRefs,
	playerFranchiseStints,
	players,
	teams,
} from "../../db/schema"
import { normalizeName } from "../../db/sync/name-match"
import {
	type HistoryLeague,
	loadLeagueTeams,
} from "../franchise-history/franchise-map"
import { HISTORY_SOURCE, type Log } from "../franchise-history/types"
import { chunks } from "../franchise-history/write-stints"
import { type SourcePick, SPLIT_SEASON, UNDRAFTED_FROM } from "./types"

// Writes a league's draft classes into draft_entries, replacing what was
// there. Run after the league's franchise history (history:ingest), since
// that is what made the players rows a pick links to:
//   1. the source id, against the refs the history ingest wrote,
//   2. otherwise the name, against the league's players who started within
//      a few seasons of that draft, when exactly one fits.
// A pick that matches neither keeps only its name.
//
// Then everyone in the league with no pick at all, whose first season
// follows a draft the data covers, becomes an undrafted entry in that class.

export type DraftWriteResult = {
	picks: number
	linkedByRef: number
	linkedByName: number
	undrafted: number
	unknownTeams: string[]
}

// How many seasons after his draft a player can first show up and still be
// matched to his pick by name: a second-round NBA pick stashed overseas, a
// hockey prospect three years in junior.
const NAME_MATCH_SEASONS = 6

type LeaguePlayer = { playerId: string; name: string; firstSeason: number }

// Everyone who played in the league, with the first season he played (the
// year it ended), from the franchise history.
async function leaguePlayers(leagueId: string): Promise<LeaguePlayer[]> {
	return db
		.select({
			playerId: players.id,
			name: players.name,
			firstSeason:
				sql<number>`min(${playerFranchiseStints.firstSeason})`.mapWith(Number),
		})
		.from(playerFranchiseStints)
		.innerJoin(teams, eq(teams.id, playerFranchiseStints.teamId))
		.innerJoin(players, eq(players.id, playerFranchiseStints.playerId))
		.where(eq(teams.leagueId, leagueId))
		.groupBy(players.id, players.name)
}

// The draft a player's first season follows.
export const classOf = (league: HistoryLeague, firstSeason: number) =>
	SPLIT_SEASON[league] ? firstSeason - 1 : firstSeason

export async function writeDrafts(
	league: HistoryLeague,
	picks: SourcePick[],
	log: Log = () => {},
): Promise<DraftWriteResult> {
	const leagueTeams = await loadLeagueTeams(league)
	const refs = new Map(
		(
			await db
				.select({
					sourceId: externalRefs.sourceId,
					playerId: externalRefs.entityId,
				})
				.from(externalRefs)
				.where(
					and(
						eq(externalRefs.source, HISTORY_SOURCE[league]),
						eq(externalRefs.entityType, "player"),
					),
				)
		).map((ref) => [ref.sourceId, ref.playerId]),
	)
	const everyone = await leaguePlayers(leagueTeams.leagueId)
	const byName = new Map<string, LeaguePlayer[]>()
	for (const player of everyone) {
		const key = normalizeName(player.name)
		byName.set(key, [...(byName.get(key) ?? []), player])
	}

	// A source can list one pick twice (statsapi does, now and then).
	const slots = new Set<string>()
	const unique = picks.filter((pick) => {
		const key = `${pick.year}:${pick.overall}`
		if (slots.has(key)) return false
		slots.add(key)
		return true
	})

	let linkedByRef = 0
	let linkedByName = 0
	const unknownTeams = new Set<string>()
	const resolved = unique.map((pick) => {
		const team = pick.teamAbbreviation
			? leagueTeams.byAbbreviation.get(pick.teamAbbreviation)
			: undefined
		if (pick.teamAbbreviation && !team) unknownTeams.add(pick.teamAbbreviation)
		let playerId = pick.sourceId ? refs.get(pick.sourceId) : undefined
		if (playerId) {
			linkedByRef++
		} else {
			const fits = (byName.get(normalizeName(pick.name)) ?? []).filter(
				(player) => {
					const after = classOf(league, player.firstSeason) - pick.year
					return after >= 0 && after <= NAME_MATCH_SEASONS
				},
			)
			if (fits.length === 1) {
				playerId = fits[0]?.playerId
				linkedByName++
			}
		}
		return {
			leagueId: leagueTeams.leagueId,
			year: pick.year,
			round: pick.round,
			overall: pick.overall,
			teamId: team?.id ?? null,
			teamName: pick.teamName ?? team?.name ?? null,
			playerId: playerId ?? null,
			playerName: pick.name,
		}
	})
	if (unknownTeams.size > 0) {
		log(`${league}: no team for ${[...unknownTeams].join(", ")}`)
	}

	// A player drafted twice belongs to the later class, the one he signed
	// out of; the earlier pick keeps his name.
	const latest = new Map<string, number>()
	for (const row of resolved) {
		if (!row.playerId) continue
		latest.set(row.playerId, Math.max(latest.get(row.playerId) ?? 0, row.year))
	}
	for (const row of resolved) {
		if (row.playerId && latest.get(row.playerId) !== row.year) {
			row.playerId = null
		}
	}
	// Two picks of one class matched to one player can't both be him.
	const seen = new Set<string>()
	for (const row of resolved) {
		if (!row.playerId) continue
		if (seen.has(row.playerId)) row.playerId = null
		else seen.add(row.playerId)
	}

	const from = UNDRAFTED_FROM[league]
	const lastClass = resolved.reduce((max, row) => Math.max(max, row.year), 0)
	const undrafted =
		from === null
			? []
			: everyone
					.filter((player) => {
						if (seen.has(player.playerId)) return false
						const year = classOf(league, player.firstSeason)
						return year >= from && year <= lastClass
					})
					.map((player) => ({
						leagueId: leagueTeams.leagueId,
						year: classOf(league, player.firstSeason),
						round: null,
						overall: null,
						teamId: null,
						teamName: null,
						playerId: player.playerId,
						playerName: player.name,
					}))

	await db.transaction(async (tx) => {
		await tx
			.delete(draftEntries)
			.where(eq(draftEntries.leagueId, leagueTeams.leagueId))
		for (const batch of chunks([...resolved, ...undrafted])) {
			await tx.insert(draftEntries).values(batch)
		}
	})

	return {
		picks: resolved.length,
		linkedByRef,
		linkedByName,
		undrafted: undrafted.length,
		unknownTeams: [...unknownTeams],
	}
}

export const describeDraftResult = (
	league: HistoryLeague,
	r: DraftWriteResult,
) =>
	`${league}: ${r.picks} picks, linked ${r.linkedByRef} by ref and ${r.linkedByName} by name; ${r.undrafted} undrafted`

// Every class a league's entries hold, for the prompt catalog.
export async function draftClasses(): Promise<
	{ leagueId: string; year: number }[]
> {
	return db
		.selectDistinct({
			leagueId: draftEntries.leagueId,
			year: draftEntries.year,
		})
		.from(draftEntries)
		.where(sql`${draftEntries.overall} is not null`)
}
