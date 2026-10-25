import { and, eq, inArray, isNull } from "drizzle-orm"
import { db } from "../../db"
import {
	externalRefs,
	leagues,
	playerFranchiseStints,
	players,
	teams,
} from "../../db/schema"
import { isHistoryLeague } from "../franchise-history/franchise-map"
import { HISTORY_SOURCE } from "../franchise-history/types"
import { isStorageConfigured } from "../storage"
import { preparePortrait } from "./portrait-image"
import { cdnCandidates, findPhoto, type PortraitSubject } from "./sources"
import { savePortrait } from "./store"

// Builds portraits for the players someone just put on a Rushmore who don't
// have one yet, so the share image shows their faces the first time it's
// looked at instead of waiting on the backfill. Any player in a franchise
// history counts, retired or not: a retired player's league CDN keeps his
// photo under the history source's id (an MLBAM or NHL id), and his
// headshotUrl points at it. Only the league CDNs, which answer fast; a player
// they have no photo of keeps his initials until the backfill reaches him.
export async function buildPickedPortraits(
	playerIds: string[],
): Promise<number> {
	if (playerIds.length === 0 || !isStorageConfigured()) return 0
	const rows = await db
		.selectDistinct({
			playerId: players.id,
			name: players.name,
			headshotUrl: players.headshotUrl,
			league: leagues.slug,
		})
		.from(players)
		.innerJoin(
			playerFranchiseStints,
			eq(playerFranchiseStints.playerId, players.id),
		)
		.innerJoin(teams, eq(teams.id, playerFranchiseStints.teamId))
		.innerJoin(leagues, eq(leagues.id, teams.leagueId))
		.where(and(inArray(players.id, playerIds), isNull(players.portraitKey)))
	if (rows.length === 0) return 0

	const refs = await db
		.select({
			entityId: externalRefs.entityId,
			source: externalRefs.source,
			sourceId: externalRefs.sourceId,
		})
		.from(externalRefs)
		.where(
			and(
				eq(externalRefs.entityType, "player"),
				inArray(
					externalRefs.entityId,
					rows.map((row) => row.playerId),
				),
			),
		)
	const subjects: PortraitSubject[] = rows.flatMap((row) => {
		const league = row.league
		if (!isHistoryLeague(league)) return []
		const ref = (source: string) =>
			refs.find((r) => r.entityId === row.playerId && r.source === source)
				?.sourceId ?? null
		return [
			{
				playerId: row.playerId,
				name: row.name,
				league,
				headshotUrl: row.headshotUrl,
				historyId: ref(HISTORY_SOURCE[league]),
				espnId: ref("espn")?.split(":")[1] ?? null,
			},
		]
	})

	const built = await Promise.all(
		subjects.map(async (subject) => {
			try {
				const photo = await findPhoto(cdnCandidates(subject))
				if (!photo) return false
				const png = await preparePortrait(photo.image, photo.cutout)
				if (!png) return false
				await savePortrait(subject.playerId, png)
				return true
			} catch (error) {
				console.error(`[portraits] ${subject.name} failed:`, error)
				return false
			}
		}),
	)
	return built.filter(Boolean).length
}
