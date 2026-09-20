import { db } from "../index"
import { parseBoxScore } from "./box-score-parse"
import { persistBoxScore } from "./box-score-store"
import { EspnRequestError, fetchGameSummary } from "./espn-client"
import { createEspnRequester, DEFAULT_ESPN_SPACING_MS } from "./espn-requester"
import { SYNCED_LEAGUES } from "./leagues"

// The same rate the scheduler already hits ESPN at. A bulk pass makes the same
// number of requests whichever spacing it uses, and the rate is what a host
// cares about, so there was no case for the backfill crawling at a quarter of
// a proven-safe speed - it just turned nine minutes of MLB into thirty-six.
// Override with --spacing when a run needs to tread more carefully.
export const BACKFILL_SPACING_MS = DEFAULT_ESPN_SPACING_MS

// Logged every this many games so a long run shows progress without a line per
// game.
const PROGRESS_EVERY = 25

export type BackfillFilters = {
	leagueSlugs?: string[]
	seasonYears?: number[]
	from?: Date
	to?: Date
	limit?: number
}

export type BackfillCandidate = {
	game: {
		id: string
		homeTeamId: string
		awayTeamId: string
		startsAt: Date
		seasonId: string
		leagueId: string
	}
	leagueSlug: string
	espnEventId: string
}

export type BackfillSelection = {
	candidates: BackfillCandidate[]
	// Final games the filters matched that can't be fetched: no ESPN event ref,
	// or a league this app doesn't sync. Counted rather than listed so a dry
	// run reports an honest total instead of implying they'll be captured.
	skippedNoEspnRef: number
	skippedUnsyncedLeague: number
}

const espnIdOf = (sourceId: string) => sourceId.split(":")[1] ?? sourceId

// Final games whose box score was never stored, oldest first. The ordering
// plus the boxScoreSyncedAt filter is what makes a re-run resume: a game is
// stamped in the same transaction as its rows, so an interrupted run leaves
// every unfinished game exactly as it found it.
export async function selectBackfillGames(
	filters: BackfillFilters = {},
): Promise<BackfillSelection> {
	const bySlug = new Map(SYNCED_LEAGUES.map((c) => [c.leagueSlug, c]))
	const wanted = filters.leagueSlugs?.length
		? filters.leagueSlugs.filter((slug) => bySlug.has(slug))
		: [...bySlug.keys()]

	const leagues = await db.query.leagues.findMany({
		where: { slug: { in: wanted } },
		columns: { id: true, slug: true },
	})
	if (leagues.length === 0) {
		return { candidates: [], skippedNoEspnRef: 0, skippedUnsyncedLeague: 0 }
	}
	const slugByLeagueId = new Map(leagues.map((l) => [l.id, l.slug]))

	const seasons = filters.seasonYears?.length
		? await db.query.seasons.findMany({
				where: { year: { in: filters.seasonYears } },
				columns: { id: true },
			})
		: null

	// One startsAt object, not two spreads - a second `startsAt:` key would
	// overwrite the first and quietly drop whichever bound was written earlier.
	const startsAt = {
		...(filters.from ? { gte: filters.from } : {}),
		...(filters.to ? { lt: filters.to } : {}),
	}

	const games = await db.query.games.findMany({
		where: {
			status: "final",
			boxScoreSyncedAt: { isNull: true },
			leagueId: { in: [...slugByLeagueId.keys()] },
			...(seasons ? { seasonId: { in: seasons.map((s) => s.id) } } : {}),
			...(Object.keys(startsAt).length > 0 ? { startsAt } : {}),
		},
		orderBy: { startsAt: "asc" },
		...(filters.limit ? { limit: filters.limit } : {}),
	})
	if (games.length === 0) {
		return { candidates: [], skippedNoEspnRef: 0, skippedUnsyncedLeague: 0 }
	}

	const refs = await db.query.externalRefs.findMany({
		where: {
			source: "espn",
			entityType: "game",
			entityId: { in: games.map((g) => g.id) },
		},
	})
	const espnEventIdByGameId = new Map(
		refs.map((ref) => [ref.entityId, espnIdOf(ref.sourceId)]),
	)

	const candidates: BackfillCandidate[] = []
	let skippedNoEspnRef = 0
	let skippedUnsyncedLeague = 0

	for (const game of games) {
		const leagueSlug = slugByLeagueId.get(game.leagueId)
		if (!leagueSlug || !bySlug.has(leagueSlug)) {
			skippedUnsyncedLeague += 1
			continue
		}
		const espnEventId = espnEventIdByGameId.get(game.id)
		if (!espnEventId) {
			skippedNoEspnRef += 1
			continue
		}
		candidates.push({ game, leagueSlug, espnEventId })
	}

	return { candidates, skippedNoEspnRef, skippedUnsyncedLeague }
}

export type BackfillResult = {
	captured: number
	notFinal: number
	fetchFailed: number
	failed: number
	playerRows: number
	teamRows: number
	// Set when ESPN refused us (403/429). Everything before it is captured and
	// stamped; re-running the same command picks up from there.
	refusedAfter: number | null
}

// Fetches and stores one box score per candidate, in order. A refusal stops
// the run rather than being retried, matching how the live path treats one -
// see espn-requester.ts, which has no retries by design.
export async function backfillBoxScores(args: {
	candidates: BackfillCandidate[]
	now: Date
	spacingMs?: number
	onProgress?: (done: number, total: number) => void
}): Promise<BackfillResult> {
	const { candidates, now, spacingMs = BACKFILL_SPACING_MS } = args
	const requester = createEspnRequester("backfill-box-scores", spacingMs)
	const result: BackfillResult = {
		captured: 0,
		notFinal: 0,
		fetchFailed: 0,
		failed: 0,
		playerRows: 0,
		teamRows: 0,
		refusedAfter: null,
	}

	const bySlug = new Map(SYNCED_LEAGUES.map((c) => [c.leagueSlug, c]))

	for (const [index, candidate] of candidates.entries()) {
		const config = bySlug.get(candidate.leagueSlug)
		if (!config) continue

		let summary: Awaited<ReturnType<typeof fetchGameSummary>> | null
		try {
			summary = await requester.request(
				`${candidate.leagueSlug} summary ${candidate.espnEventId}`,
				() => fetchGameSummary(config.espnPath, candidate.espnEventId),
			)
		} catch (error) {
			if (error instanceof EspnRequestError) {
				result.refusedAfter = result.captured
				return result
			}
			throw error
		}

		if (!summary) {
			result.fetchFailed += 1
			continue
		}

		const box = parseBoxScore(summary)
		// Leaves the game unstamped, so a later run retries it. ESPN can call a
		// game final while its box score is still filling in.
		if (!box.isFinal) {
			result.notFinal += 1
			continue
		}

		try {
			const teamRefs = await db.query.externalRefs.findMany({
				where: {
					source: "espn",
					entityType: "team",
					entityId: {
						in: [candidate.game.homeTeamId, candidate.game.awayTeamId],
					},
				},
			})
			const stored = await persistBoxScore({
				game: candidate.game,
				leagueSlug: candidate.leagueSlug,
				box,
				espnTeamIdByTeamId: new Map(
					teamRefs.map((ref) => [ref.entityId, espnIdOf(ref.sourceId)]),
				),
				now,
			})
			result.captured += 1
			result.playerRows += stored.playerRows
			result.teamRows += stored.teamRows
		} catch (error) {
			result.failed += 1
			console.error(
				`[backfill-box-scores] couldn't store game ${candidate.game.id}:`,
				error,
			)
		}

		const done = index + 1
		if (done % PROGRESS_EVERY === 0) args.onProgress?.(done, candidates.length)
	}

	return result
}
