import { and, desc, eq, inArray, isNull, max, type SQL } from "drizzle-orm"
import { db } from "../src/db"
import {
	externalRefs,
	leagues,
	playerFranchiseStints,
	players,
	teams,
} from "../src/db/schema"
import { isHistoryLeague } from "../src/lib/franchise-history/franchise-map"
import { mapPool } from "../src/lib/franchise-history/http"
import { HISTORY_SOURCE } from "../src/lib/franchise-history/types"
import { BUILD_PORTRAITS_LOCK, withJobLock } from "../src/lib/job-lock"
import { preparePortrait } from "../src/lib/portraits/portrait-image"
import {
	allCandidates,
	findPhoto,
	type PortraitSubject,
} from "../src/lib/portraits/sources"
import { markPortraitChecked, savePortrait } from "../src/lib/portraits/store"
import { addWikipediaPhotos } from "../src/lib/portraits/wiki"
import { isStorageConfigured } from "../src/lib/storage"
import { parseFlags } from "./parse-flags"

// Builds Mount Rushmore portraits for the all-time pools, best players
// first: everyone with a franchise stint and no portrait who hasn't been
// looked at yet. Each player's photo comes from the first source that has one
// (lib/portraits/sources.ts), from the league CDNs on to the reference sites
// and Wikipedia, cropped square to head and shoulders. A player with no photo
// anywhere is marked checked, and his ring shows his initials instead.
//
//   pnpm --filter api portraits:build -- --league=nba --limit=50
//   pnpm --filter api portraits:build -- --force   (rebuild, even players done)

const flags = parseFlags({
	league: { type: "string" },
	limit: { type: "string" },
	force: { type: "boolean" },
})

const BATCH = 40
const FETCH_CONCURRENCY = 4

async function loadSubjects(): Promise<PortraitSubject[]> {
	const filters: SQL[] = []
	if (!flags.force) {
		filters.push(isNull(players.portraitKey), isNull(players.portraitCheckedAt))
	}
	if (flags.league) filters.push(eq(leagues.slug, flags.league))
	const score = max(playerFranchiseStints.score)
	const rows = await db
		.select({
			playerId: players.id,
			name: players.name,
			headshotUrl: players.headshotUrl,
			league: leagues.slug,
			score,
		})
		.from(players)
		.innerJoin(
			playerFranchiseStints,
			eq(playerFranchiseStints.playerId, players.id),
		)
		.innerJoin(teams, eq(teams.id, playerFranchiseStints.teamId))
		.innerJoin(leagues, eq(leagues.id, teams.leagueId))
		.where(filters.length ? and(...filters) : undefined)
		.groupBy(players.id, leagues.slug)
		.orderBy(desc(score))
		.limit(Number(flags.limit) || 100)

	const ids = rows.map((row) => row.playerId)
	const refs = ids.length
		? await db
				.select({
					entityId: externalRefs.entityId,
					source: externalRefs.source,
					sourceId: externalRefs.sourceId,
				})
				.from(externalRefs)
				.where(
					and(
						eq(externalRefs.entityType, "player"),
						inArray(externalRefs.entityId, ids),
					),
				)
		: []
	return rows.flatMap((row) => {
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
}

type Tally = {
	built: number
	none: number
	bySource: Map<string, number>
}

async function processBatch(
	subjects: PortraitSubject[],
	tally: Tally,
): Promise<void> {
	await addWikipediaPhotos(subjects)
	const found = await mapPool(subjects, FETCH_CONCURRENCY, async (subject) => {
		try {
			return await findPhoto(allCandidates(subject))
		} catch (error) {
			console.error(`  ${subject.name}: ${error}`)
			return null
		}
	})

	const none: string[] = []
	for (const [i, subject] of subjects.entries()) {
		const photo = found[i] ?? null
		const png = photo ? await preparePortrait(photo.image, photo.cutout) : null
		if (!photo || !png) {
			none.push(subject.playerId)
			console.log(`  ${subject.name}: no photo`)
			continue
		}
		await savePortrait(subject.playerId, png)
		tally.built++
		tally.bySource.set(photo.source, (tally.bySource.get(photo.source) ?? 0) + 1)
		console.log(`  ${subject.name}: ${photo.source}`)
	}
	await markPortraitChecked(none)
	tally.none += none.length
}

async function main(): Promise<void> {
	if (!isStorageConfigured()) {
		throw new Error("R2 isn't configured (R2_* in .env); nowhere to put portraits")
	}
	const subjects = await loadSubjects()
	console.log(`${subjects.length} players to look at`)
	const tally: Tally = { built: 0, none: 0, bySource: new Map() }
	for (let i = 0; i < subjects.length; i += BATCH) {
		await processBatch(subjects.slice(i, i + BATCH), tally)
	}
	console.log(
		`Built ${tally.built} (${[...tally.bySource].map(([s, n]) => `${s} ${n}`).join(", ")}), no photo for ${tally.none}`,
	)
}

const { ran } = await withJobLock(BUILD_PORTRAITS_LOCK, main)
if (!ran) console.log(`${BUILD_PORTRAITS_LOCK} is running elsewhere, skipped`)
process.exit(0)
