import { and, eq, isNotNull, isNull } from "drizzle-orm"
import sharp from "sharp"
import { db } from "../../db"
import { externalRefs, leagues, players, teams } from "../../db/schema"
import { isHistoryLeague } from "../franchise-history/franchise-map"
import { mapPool } from "../franchise-history/http"
import { isStorageConfigured } from "../storage"
import { preparePortrait } from "./portrait-image"
import { cdnCandidates, findPhoto, type PortraitSubject } from "./sources"
import { savePortrait } from "./store"

// The daily step that builds portraits for current players from their league
// CDN headshot. A player the CDN has no photo of is left for the backfill,
// which looks further afield (scripts/build-portraits.ts), so this marks
// nothing as checked when it finds nothing. It runs on the API's small VM, so
// one image at a time and no image cache.

const CONCURRENCY = 2

export async function buildCurrentPortraits(
	log: (line: string) => void = (line) => console.log(line),
): Promise<{ built: number; skipped: number }> {
	if (!isStorageConfigured()) {
		log("[portraits] R2 isn't configured, skipped")
		return { built: 0, skipped: 0 }
	}
	sharp.cache(false)
	sharp.concurrency(1)

	const rows = await db
		.select({
			playerId: players.id,
			name: players.name,
			headshotUrl: players.headshotUrl,
			league: leagues.slug,
			espnRef: externalRefs.sourceId,
		})
		.from(players)
		.innerJoin(teams, eq(teams.id, players.currentTeamId))
		.innerJoin(leagues, eq(leagues.id, teams.leagueId))
		.leftJoin(
			externalRefs,
			and(
				eq(externalRefs.entityId, players.id),
				eq(externalRefs.source, "espn"),
				eq(externalRefs.entityType, "player"),
			),
		)
		.where(and(isNull(players.portraitKey), isNotNull(players.headshotUrl)))

	const subjects: PortraitSubject[] = rows.flatMap((row) => {
		const league = row.league
		if (!isHistoryLeague(league)) return []
		return [
			{
				playerId: row.playerId,
				name: row.name,
				league,
				headshotUrl: row.headshotUrl,
				historyId: null,
				espnId: row.espnRef?.split(":")[1] ?? null,
			},
		]
	})

	let built = 0
	await mapPool(subjects, CONCURRENCY, async (subject) => {
		try {
			const photo = await findPhoto(cdnCandidates(subject))
			if (!photo) return
			const png = await preparePortrait(photo.image, photo.cutout)
			if (!png) return
			await savePortrait(subject.playerId, png)
			built++
		} catch (error) {
			log(`[portraits] ${subject.name} failed: ${error}`)
		}
	})
	log(`[portraits] built ${built} of ${subjects.length} current players`)
	return { built, skipped: subjects.length - built }
}
