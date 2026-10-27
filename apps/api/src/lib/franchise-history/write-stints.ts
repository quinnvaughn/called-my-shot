import { randomUUID } from "node:crypto"
import { and, eq, inArray, like, lt, sql } from "drizzle-orm"
import { db } from "../../db"
import {
	externalRefs,
	playerFranchiseStints,
	players,
	playerTeamSeasons,
	teams,
} from "../../db/schema"
import {
	buildNameIndex,
	findByName,
	normalizeName,
} from "../../db/sync/name-match"
import { scopedSourceId } from "../../db/sync/sync-refs"
import { type HistoryLeague, loadLeagueTeams } from "./franchise-map"
import {
	HISTORY_SOURCE,
	type HistoryPlayer,
	type HistoryStint,
	type Log,
} from "./types"

// Writes a league's all-time history: every source player linked to a
// players row, one player_franchise_stints row per player per franchise, and
// one player_team_seasons row per player per franchise per season.
//
// A source player is matched to a row this app already has in order of how
// sure the match is:
//   1. a ref from an earlier ingest of the same source,
//   2. the ESPN id a crosswalk gives, against the live sync's ESPN refs,
//   3. the league CDN id inside a current player's headshotUrl,
//   4. for a player the source says is still active, name and team against
//      current rosters (db/sync/name-match.ts),
// and only then inserted as a new historical player, with no current team.
// Whichever way he was found, the source id is linked so the next ingest
// takes step 1.
//
// A rerun replaces the league's stints and seasons: whatever this run didn't
// write (a franchise mapping that changed, a source row that went away) is
// deleted.

export type WriteResult = {
	players: number
	stints: number
	teamSeasons: number
	linkedByRef: number
	linkedByEspn: number
	linkedByImage: number
	linkedByName: number
	created: number
	unknownTeams: string[]
}

// Where each league's current headshotUrl carries the id its CDN keys photos
// by (see db/sync/league-images.ts). The NFL's come from ESPN, whose id
// step 2 already covers.
export const IMAGE_ID_PATTERN: Record<HistoryLeague, RegExp | null> = {
	nba: /\/headshots\/nba\/latest\/\d+x\d+\/(\d+)\.png/,
	mlb: /\/v1\/people\/(\d+)\//,
	nhl: /\/mugs\/nhl\/.+\/(\d+)\.png/,
	nfl: null,
}

const CHUNK = 1_000

// How far back a source player's last season can be and still be matched by
// id to someone on a roster today.
const RECENT_SEASONS = 6

// The value an upsert tried to insert, for its DO UPDATE SET.
const excluded = (column: string) => sql.raw(`excluded.${column}`)

export function chunks<T>(items: T[], size = CHUNK): T[][] {
	const out: T[][] = []
	for (let i = 0; i < items.length; i += size)
		out.push(items.slice(i, i + size))
	return out
}

// Combines rows for one franchise that the ingester produced more than once.
function mergeStints(stints: HistoryStint[]): HistoryStint[] {
	const byTeam = new Map<string, HistoryStint>()
	for (const stint of stints) {
		const prev = byTeam.get(stint.teamAbbreviation)
		byTeam.set(
			stint.teamAbbreviation,
			prev
				? {
						teamAbbreviation: stint.teamAbbreviation,
						firstSeason: Math.min(prev.firstSeason, stint.firstSeason),
						lastSeason: Math.max(prev.lastSeason, stint.lastSeason),
						seasons: prev.seasons + stint.seasons,
						games:
							prev.games === null && stint.games === null
								? null
								: (prev.games ?? 0) + (stint.games ?? 0),
						score: prev.score + stint.score,
						hallOfFame: prev.hallOfFame || stint.hallOfFame,
					}
				: stint,
		)
	}
	return [...byTeam.values()]
}

type Resolution = {
	kind: "ref" | "espn" | "image" | "name" | "new"
	playerId: string
}

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"])

// "Ernest Udeh Jr." -> "udeh".
function surname(name: string): string {
	const words = normalizeName(name).split(" ")
	while (words.length > 1 && SUFFIXES.has(words[words.length - 1] ?? ""))
		words.pop()
	return words[words.length - 1] ?? ""
}

const latestTeam = (player: HistoryPlayer) =>
	player.stints.reduce((a, b) => (b.lastSeason > a.lastSeason ? b : a))
		.teamAbbreviation

export async function writeHistory(
	league: HistoryLeague,
	input: HistoryPlayer[],
	log: Log = () => {},
): Promise<WriteResult> {
	const source = HISTORY_SOURCE[league]
	const leagueTeams = await loadLeagueTeams(league)
	const runStartedAt = new Date()

	const unknownTeams = new Set<string>()
	const bySource = new Map<string, HistoryPlayer>()
	for (const player of input) {
		const stints = player.stints.filter((stint) => {
			if (leagueTeams.byAbbreviation.has(stint.teamAbbreviation)) return true
			unknownTeams.add(stint.teamAbbreviation)
			return false
		})
		if (stints.length === 0) continue
		const prev = bySource.get(player.sourceId)
		bySource.set(player.sourceId, {
			...player,
			stints: mergeStints([...(prev?.stints ?? []), ...stints]),
			teamSeasons: [
				...(prev?.teamSeasons ?? []),
				...player.teamSeasons.filter((row) =>
					leagueTeams.byAbbreviation.has(row.teamAbbreviation),
				),
			],
		})
	}
	if (unknownTeams.size > 0) {
		log(`No ${league} team for ${[...unknownTeams].join(", ")}, dropped`)
	}

	// Everything the matching reads, loaded once.
	const sourceRefs = await db
		.select({
			sourceId: externalRefs.sourceId,
			playerId: externalRefs.entityId,
		})
		.from(externalRefs)
		.where(
			and(
				eq(externalRefs.source, source),
				eq(externalRefs.entityType, "player"),
			),
		)
	const refPlayerIds = new Set(
		(sourceRefs.length
			? await db
					.select({ id: players.id })
					.from(players)
					.where(
						inArray(
							players.id,
							sourceRefs.map((ref) => ref.playerId),
						),
					)
			: []
		).map((row) => row.id),
	)
	const byRef = new Map(
		sourceRefs
			.filter((ref) => refPlayerIds.has(ref.playerId))
			.map((ref) => [ref.sourceId, ref.playerId]),
	)
	// A player already carrying a ref from this source can't take a second one
	// (external_refs is unique per source and entity).
	const claimed = new Set(byRef.values())

	const espnRefs = await db
		.select({
			sourceId: externalRefs.sourceId,
			playerId: externalRefs.entityId,
		})
		.from(externalRefs)
		.where(
			and(
				eq(externalRefs.source, "espn"),
				eq(externalRefs.entityType, "player"),
				like(externalRefs.sourceId, `${league}:%`),
			),
		)
	const byEspn = new Map(espnRefs.map((ref) => [ref.sourceId, ref.playerId]))
	const espnLinked = new Set(byEspn.values())

	const current = await db
		.select({
			id: players.id,
			name: players.name,
			headshotUrl: players.headshotUrl,
			team: teams.abbreviation,
		})
		.from(players)
		.innerJoin(teams, eq(teams.id, players.currentTeamId))
		.where(eq(teams.leagueId, leagueTeams.leagueId))
	const imagePattern = IMAGE_ID_PATTERN[league]
	const byImage = new Map<string, string>()
	if (imagePattern) {
		for (const row of current) {
			const id = row.headshotUrl?.match(imagePattern)?.[1]
			if (id) byImage.set(id, row.id)
		}
	}
	const nameIndex = buildNameIndex(
		current.map((row) => ({ team: row.team, name: row.name, value: row.id })),
	)

	const names = new Map(current.map((row) => [row.id, row.name]))
	const espnTargets = [...espnLinked].filter((id) => !names.has(id))
	for (const batch of chunks(espnTargets)) {
		const rows = await db
			.select({ id: players.id, name: players.name })
			.from(players)
			.where(inArray(players.id, batch))
		for (const row of rows) names.set(row.id, row.name)
	}

	// An id two source players both claim is a crosswalk error (Wikidata has
	// given one brother the other's ESPN id), so neither gets to use it.
	const repeated = (ids: (string | null)[]) => {
		const seen = new Set<string>()
		const twice = new Set<string>()
		for (const id of ids) {
			if (!id) continue
			if (seen.has(id)) twice.add(id)
			seen.add(id)
		}
		return twice
	}
	const all = [...bySource.values()]
	const sharedEspn = repeated(all.map((player) => player.espnId))
	const sharedImage = repeated(all.map((player) => player.imageId))

	// Id matches still have to agree on the surname and, for someone on a
	// roster today, on his having played in recent years: the backstops for a
	// crosswalk that points at the wrong man (nflverse once gave a 1992 Lion a
	// 2026 rookie's ESPN id). Recent is generous, since a roster carries
	// veterans coming back from a few years away.
	const onRoster = new Set(current.map((row) => row.id))
	const lastSeason = (player: HistoryPlayer) =>
		player.stints.reduce((last, stint) => Math.max(last, stint.lastSeason), 0)
	const sourceLatest = all.reduce(
		(latest, player) => Math.max(latest, lastSeason(player)),
		0,
	)
	const recent = (player: HistoryPlayer) =>
		lastSeason(player) >= sourceLatest - RECENT_SEASONS
	const agrees = (player: HistoryPlayer, playerId: string) => {
		const theirs = names.get(playerId)
		return (
			theirs !== undefined &&
			surname(theirs) === surname(player.name) &&
			(!onRoster.has(playerId) || recent(player))
		)
	}

	const byEspnId = (player: HistoryPlayer) =>
		player.espnId && !sharedEspn.has(player.espnId)
			? byEspn.get(scopedSourceId(league, player.espnId))
			: null
	const byImageId = (player: HistoryPlayer) =>
		player.imageId && !sharedImage.has(player.imageId)
			? byImage.get(player.imageId)
			: null

	// An earlier ingest's ref stands, with two exceptions. One that points at
	// someone on a roster today from a player long retired is a bad link and
	// is dropped. And one that points at a historical row gives way when the
	// player turns out to be on a roster today (a crosswalk that learned his
	// ESPN id since): the source id moves to the current player, and the old
	// row is left with no stints.
	const byPreviousRef = (player: HistoryPlayer) => {
		const refId = byRef.get(player.sourceId)
		if (!refId) return null
		if (onRoster.has(refId)) return recent(player) ? refId : null
		const current = [byEspnId(player), byImageId(player)].find(
			(id) => id && onRoster.has(id) && !claimed.has(id) && agrees(player, id),
		)
		return current ? null : refId
	}

	// Strongest evidence first, across every player, so a weak match for one
	// player can't take a row a stronger match for another was pointing at.
	const passes: [
		Resolution["kind"],
		(player: HistoryPlayer) => string | null | undefined,
	][] = [
		["ref", byPreviousRef],
		["espn", byEspnId],
		["image", byImageId],
		[
			"name",
			(player) =>
				player.active
					? findByName(nameIndex, player.name, latestTeam(player))
					: null,
		],
	]
	const counts = { ref: 0, espn: 0, image: 0, name: 0, new: 0 }
	const resolutions = new Map<string, Resolution>()
	for (const [kind, find] of passes) {
		for (const player of all) {
			if (resolutions.has(player.sourceId)) continue
			const playerId = find(player)
			if (!playerId) continue
			if (
				kind !== "ref" &&
				(claimed.has(playerId) || !agrees(player, playerId))
			)
				continue
			claimed.add(playerId)
			counts[kind]++
			resolutions.set(player.sourceId, { kind, playerId })
		}
	}
	for (const player of all) {
		if (resolutions.has(player.sourceId)) continue
		counts.new++
		resolutions.set(player.sourceId, { kind: "new", playerId: randomUUID() })
	}

	let stintCount = 0
	let teamSeasonCount = 0
	await db.transaction(async (tx) => {
		const created = [...bySource.values()].filter(
			(player) => resolutions.get(player.sourceId)?.kind === "new",
		)
		for (const batch of chunks(created)) {
			await tx.insert(players).values(
				batch.map((player) => ({
					id: (resolutions.get(player.sourceId) as Resolution).playerId,
					name: player.name,
					position: player.position,
					headshotUrl: player.headshotUrl,
				})),
			)
		}

		const refs = [...bySource.values()]
			.filter((player) => resolutions.get(player.sourceId)?.kind !== "ref")
			.map((player) => ({
				source,
				entityType: "player" as const,
				sourceId: player.sourceId,
				entityId: (resolutions.get(player.sourceId) as Resolution).playerId,
			}))
		for (const batch of chunks(refs)) {
			await tx
				.insert(externalRefs)
				.values(batch)
				.onConflictDoUpdate({
					target: [
						externalRefs.source,
						externalRefs.entityType,
						externalRefs.sourceId,
					],
					set: { entityId: excluded("entity_id") },
				})
		}

		// A new historical player's ESPN id, when the crosswalk had one ESPN's
		// sync hasn't already given to someone. Should he ever turn up on a
		// roster again, the live sync updates this row instead of adding him
		// twice.
		const espnLinks = created
			.filter(
				(player) =>
					player.espnId && !byEspn.has(scopedSourceId(league, player.espnId)),
			)
			.map((player) => ({
				source: "espn" as const,
				entityType: "player" as const,
				sourceId: scopedSourceId(league, player.espnId as string),
				entityId: (resolutions.get(player.sourceId) as Resolution).playerId,
			}))
			.filter((link) => !espnLinked.has(link.entityId))
		for (const batch of chunks(espnLinks)) {
			await tx.insert(externalRefs).values(batch).onConflictDoNothing()
		}

		const stintRows = [...bySource.values()].flatMap((player) =>
			player.stints.map((stint) => ({
				playerId: (resolutions.get(player.sourceId) as Resolution).playerId,
				teamId: (
					leagueTeams.byAbbreviation.get(stint.teamAbbreviation) as {
						id: string
					}
				).id,
				firstSeason: stint.firstSeason,
				lastSeason: stint.lastSeason,
				seasons: stint.seasons,
				games: stint.games,
				score: Math.round(stint.score * 1000) / 1000,
				hallOfFame: stint.hallOfFame,
				updatedAt: runStartedAt,
			})),
		)
		stintCount = stintRows.length
		for (const batch of chunks(stintRows)) {
			await tx
				.insert(playerFranchiseStints)
				.values(batch)
				.onConflictDoUpdate({
					target: [
						playerFranchiseStints.playerId,
						playerFranchiseStints.teamId,
					],
					set: {
						firstSeason: excluded("first_season"),
						lastSeason: excluded("last_season"),
						seasons: excluded("seasons"),
						games: excluded("games"),
						score: excluded("score"),
						hallOfFame: excluded("hall_of_fame"),
						updatedAt: excluded("updated_at"),
					},
				})
		}

		const leagueTeamIds = [...leagueTeams.byAbbreviation.values()].map(
			(team) => team.id,
		)
		await tx
			.delete(playerFranchiseStints)
			.where(
				and(
					inArray(playerFranchiseStints.teamId, leagueTeamIds),
					lt(playerFranchiseStints.updatedAt, runStartedAt),
				),
			)

		const seasonRows = new Map<
			string,
			{ playerId: string; teamId: string; season: number }
		>()
		for (const player of bySource.values()) {
			const playerId = (resolutions.get(player.sourceId) as Resolution).playerId
			for (const row of player.teamSeasons) {
				const teamId = (
					leagueTeams.byAbbreviation.get(row.teamAbbreviation) as {
						id: string
					}
				).id
				seasonRows.set(`${playerId}:${teamId}:${row.season}`, {
					playerId,
					teamId,
					season: row.season,
				})
			}
		}
		teamSeasonCount = seasonRows.size
		await tx
			.delete(playerTeamSeasons)
			.where(inArray(playerTeamSeasons.teamId, leagueTeamIds))
		for (const batch of chunks([...seasonRows.values()])) {
			await tx.insert(playerTeamSeasons).values(batch)
		}
	})

	return {
		players: bySource.size,
		stints: stintCount,
		teamSeasons: teamSeasonCount,
		linkedByRef: counts.ref,
		linkedByEspn: counts.espn,
		linkedByImage: counts.image,
		linkedByName: counts.name,
		created: counts.new,
		unknownTeams: [...unknownTeams],
	}
}

export const describeResult = (league: HistoryLeague, r: WriteResult) =>
	`${league}: ${r.players} players, ${r.stints} stints, ${r.teamSeasons} player seasons; linked ${r.linkedByRef} by ref, ${r.linkedByEspn} by ESPN id, ${r.linkedByImage} by headshot id, ${r.linkedByName} by name; created ${r.created}`
