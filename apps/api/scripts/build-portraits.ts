import { setTimeout as sleep } from "node:timers/promises"
import { and, desc, eq, inArray, isNull, max, type SQL } from "drizzle-orm"
import { db } from "../src/db"
import {
	externalRefs,
	leagues,
	playerFranchiseStints,
	players,
	teams,
} from "../src/db/schema"
import {
	type HistoryLeague,
	isHistoryLeague,
} from "../src/lib/franchise-history/franchise-map"
import { mapPool } from "../src/lib/franchise-history/http"
import { HISTORY_SOURCE } from "../src/lib/franchise-history/types"
import { BACKFILL_PORTRAITS_LOCK, withJobLock } from "../src/lib/job-lock"
import { preparePortrait } from "../src/lib/portraits/portrait-image"
import {
	cdnCandidates,
	fallbackCandidates,
	findPhoto,
	type PortraitCandidate,
	type PortraitPhoto,
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
//   pnpm --filter api portraits:build                  (everyone not done yet)
//   pnpm --filter api portraits:build -- --league=nba --limit=50
//   pnpm --filter api portraits:build -- --force   (rebuild, even players done)
//
// Every player it looks at is marked, so stopping it partway and running it
// again picks up where it left off.

const flags = parseFlags({
	league: { type: "string" },
	limit: { type: "string" },
	force: { type: "boolean" },
})

// Players taken through together, per league. One Wikidata query covers a
// whole chunk's misses (wiki.ts asks about 200 at a time).
const CHUNK = 200
// Players in flight at once, per league. The hosts with limits are spaced in
// politeFetch whatever this is, so it's only how much waiting on one
// player's photo, upload or database write overlaps with the rest.
const CONCURRENCY = 16

async function loadSubjects(): Promise<PortraitSubject[]> {
	const filters: SQL[] = []
	if (!flags.force) {
		filters.push(isNull(players.portraitKey), isNull(players.portraitCheckedAt))
	}
	if (flags.league) filters.push(eq(leagues.slug, flags.league))
	const score = max(playerFranchiseStints.score)
	const query = db
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
	const limit = Number(flags.limit)
	const rows = await (limit > 0 ? query.limit(limit) : query)

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
	const refIds = new Map(
		refs.map((r) => [`${r.entityId}:${r.source}`, r.sourceId]),
	)
	return rows.flatMap((row) => {
		const league = row.league
		if (!isHistoryLeague(league)) return []
		const ref = (source: string) =>
			refIds.get(`${row.playerId}:${source}`) ?? null
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
	looked: number
	built: number
	none: number
	bySource: Map<string, number>
}

async function look(
	subject: PortraitSubject,
	candidates: PortraitCandidate[],
): Promise<PortraitPhoto | null> {
	try {
		return await findPhoto(candidates)
	} catch (error) {
		console.error(`  ${subject.name}: ${error}`)
		return null
	}
}

// Writes to R2 and the database, tried again after a dropped connection
// (Neon closes every connection when its compute restarts). Both writes are
// safe to repeat: the key is the image's hash.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await fn()
		} catch (error) {
			if (attempt >= 4) throw error
			await sleep(attempt * 3_000)
		}
	}
}

type Outcome = "built" | "none" | "failed"

// Crops and stores the photo: "none" when it has nothing to crop, "failed"
// when the writes don't land (logged, and left unmarked so the next run
// tries him again).
async function build(
	subject: PortraitSubject,
	photo: PortraitPhoto,
	tally: Tally,
): Promise<Outcome> {
	const png = await preparePortrait(photo.image, photo.cutout).catch(
		() => null,
	)
	if (!png) return "none"
	try {
		await withRetry(() => savePortrait(subject.playerId, png))
	} catch (error) {
		console.error(`  ${subject.name}: not saved, ${error}`)
		return "failed"
	}
	tally.built++
	tally.bySource.set(photo.source, (tally.bySource.get(photo.source) ?? 0) + 1)
	console.log(`  ${subject.name}: ${photo.source}`)
	return "built"
}

// The league CDNs answer fast and have most players, so the whole chunk
// tries them first. Only the players they miss are looked up on Wikidata and
// tried on the reference sites and Wikipedia, which are slow and rate
// limited.
async function processChunk(
	subjects: PortraitSubject[],
	tally: Tally,
): Promise<void> {
	const first = await mapPool(subjects, CONCURRENCY, async (subject) => {
		const photo = await look(subject, cdnCandidates(subject))
		return photo ? build(subject, photo, tally) : "none"
	})
	const misses = subjects.filter((_, i) => first[i] === "none")
	if (misses.length > 0) {
		try {
			await addWikipediaPhotos(misses)
		} catch (error) {
			console.error(`  Wikidata lookup failed: ${error}`)
		}
	}
	const none: string[] = []
	await mapPool(misses, CONCURRENCY, async (subject) => {
		const photo = await look(subject, fallbackCandidates(subject))
		const outcome = photo ? await build(subject, photo, tally) : "none"
		if (outcome !== "none") return
		none.push(subject.playerId)
		console.log(`  ${subject.name}: no photo`)
	})
	try {
		await withRetry(() => markPortraitChecked(none))
		tally.none += none.length
	} catch (error) {
		console.error(
			`  ${none.length} with no photo not marked, next run looks again: ${error}`,
		)
	}
	tally.looked += subjects.length
}

async function main(): Promise<void> {
	if (!isStorageConfigured()) {
		throw new Error("R2 isn't configured (R2_* in .env); nowhere to put portraits")
	}
	const subjects = await loadSubjects()
	console.log(`${subjects.length} players to look at`)
	const tally: Tally = { looked: 0, built: 0, none: 0, bySource: new Map() }
	const byLeague = new Map<HistoryLeague, PortraitSubject[]>()
	for (const subject of subjects) {
		const inLeague = byLeague.get(subject.league) ?? []
		inLeague.push(subject)
		byLeague.set(subject.league, inLeague)
	}
	// One lane per league, so Basketball-Reference's spacing holds up only
	// the players waiting on it.
	await Promise.all(
		[...byLeague].map(async ([league, inLeague]) => {
			for (let i = 0; i < inLeague.length; i += CHUNK) {
				await processChunk(inLeague.slice(i, i + CHUNK), tally)
				console.log(
					`${league}: ${Math.min(i + CHUNK, inLeague.length)}/${inLeague.length} (all leagues ${tally.looked}/${subjects.length})`,
				)
			}
		}),
	)
	console.log(
		`Built ${tally.built} (${[...tally.bySource].map(([s, n]) => `${s} ${n}`).join(", ")}), no photo for ${tally.none}`,
	)
}

const { ran } = await withJobLock(BACKFILL_PORTRAITS_LOCK, main)
if (!ran) {
	console.log(
		`${BACKFILL_PORTRAITS_LOCK} is held by another run (one stopped partway holds it up to 5 minutes), skipped`,
	)
}
process.exit(0)
