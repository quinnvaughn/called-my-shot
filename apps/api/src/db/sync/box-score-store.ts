import { eq } from "drizzle-orm"
import {
	type BoxStatSource,
	GAME_EXTRACTORS,
} from "../../lib/auto-resolve/registry"
import { db } from "../index"
import {
	games,
	playerGameStats,
	type TeamGameStat,
	teamGameStats,
} from "../schema"
import {
	defaultStatParser,
	type ParsedBoxScore,
	parseStatNumber,
} from "./box-score-parse"
import { scopedSourceId } from "./sync-refs"

// Postgres caps a statement at 65535 bindings. An NFL game is the biggest at
// roughly 700 player cells, so this only ever splits the largest MLB team box,
// but it keeps the ceiling from being a latent surprise as leagues are added.
const INSERT_CHUNK = 1000

export type BoxScoreGame = {
	id: string
	homeTeamId: string
	awayTeamId: string
	startsAt: Date
	seasonId: string
	leagueId: string
}

export type PersistBoxScoreResult = {
	playerRows: number
	teamRows: number
	// Athletes ESPN listed that no external_ref points at yet - a same-day
	// call-up the daily roster sync hasn't seen. Their rows are still written,
	// just without a playerId. Surfaced so a sync log can show the number
	// drifting upward, which would mean the roster sync is falling behind.
	unlinkedAthletes: number
}

// Which parser a raw key is read with, per league, taken from the extractor
// that already owns that key. This is what guarantees a stored number can
// never disagree with how a question on that same stat was settled. A key no
// extractor claims falls through to defaultStatParser, which reads ESPN's own
// column-name conventions. Built once per league and memoized: the registry is
// a module constant, so this can never go stale.
const parsersByLeague = new Map<string, Map<string, BoxStatSource["parse"]>>()

function parsersFor(leagueSlug: string): Map<string, BoxStatSource["parse"]> {
	const cached = parsersByLeague.get(leagueSlug)
	if (cached) return cached

	const parsers = new Map<string, BoxStatSource["parse"]>()
	for (const [key, extractor] of Object.entries(GAME_EXTRACTORS)) {
		if (!key.startsWith(`${leagueSlug}:`)) continue
		const source = extractor.source
		if (!source) continue
		// Namespaced so a team-box key never picks up a player key's parser.
		for (const statKey of source.keys) {
			parsers.set(`${source.origin}:${statKey}`, source.parse)
		}
	}
	parsersByLeague.set(leagueSlug, parsers)
	return parsers
}

function numericFor(
	parsers: Map<string, BoxStatSource["parse"]>,
	origin: BoxStatSource["origin"],
	statKey: string,
	raw: string,
): number | null {
	const parse =
		parsers.get(`${origin}:${statKey}`) ?? defaultStatParser(statKey)
	return parse(raw)
}

// Stores one final box score in full: every athlete's every cell, both teams'
// team-box cells, the player tables' totals rows, and the linescores. Replaces the game's rows
// wholesale rather than upserting, the same way saveStarters replaces a game's
// starters - it's the only strategy that handles ESPN dropping a column or a
// player during the stat correction the 24h re-check exists to catch.
//
// Caller must have checked box.isFinal. A partial box score stored here would
// be indistinguishable from a real one afterwards.
export async function persistBoxScore(args: {
	game: BoxScoreGame
	leagueSlug: string
	box: ParsedBoxScore
	// teamId -> espnTeamId, as loadEspnRefs already builds it.
	espnTeamIdByTeamId: Map<string, string>
	now: Date
}): Promise<PersistBoxScoreResult> {
	const { game, leagueSlug, box, espnTeamIdByTeamId, now } = args
	const parsers = parsersFor(leagueSlug)

	const teamIdByEspnTeamId = new Map(
		[...espnTeamIdByTeamId].map(([teamId, espnTeamId]) => [espnTeamId, teamId]),
	)

	const sideOf = (espnTeamId: string) => {
		const teamId = teamIdByEspnTeamId.get(espnTeamId)
		if (teamId !== game.homeTeamId && teamId !== game.awayTeamId) return null
		const isHome = teamId === game.homeTeamId
		return {
			teamId,
			isHome,
			opponentTeamId: isHome ? game.awayTeamId : game.homeTeamId,
		}
	}

	const common = {
		gameId: game.id,
		source: "espn" as const,
		gameDate: game.startsAt,
		seasonId: game.seasonId,
		leagueId: game.leagueId,
	}

	const athleteSourceIds = [...box.athletes.keys()].map((espnAthleteId) =>
		scopedSourceId(leagueSlug, espnAthleteId),
	)

	return db.transaction(async (tx) => {
		// Serializes this game against a concurrent backfill or a second
		// auto-resolve pass, so two runs can't interleave a delete with the
		// other's insert.
		await tx.select().from(games).where(eq(games.id, game.id)).for("update")

		const playerRefs =
			athleteSourceIds.length > 0
				? await tx.query.externalRefs.findMany({
						where: {
							source: "espn",
							entityType: "player",
							sourceId: { in: athleteSourceIds },
						},
					})
				: []
		const playerIdBySourceId = new Map(
			playerRefs.map((ref) => [ref.sourceId, ref.entityId]),
		)

		const playerRows: (typeof playerGameStats.$inferInsert)[] = []
		let unlinkedAthletes = 0

		for (const [espnAthleteId, athlete] of box.athletes) {
			const side = sideOf(athlete.espnTeamId)
			// An athlete on neither competitor shouldn't happen, and a row with
			// no team is worth less than the NOT NULL it would cost.
			if (!side) continue

			const sourceAthleteId = scopedSourceId(leagueSlug, espnAthleteId)
			const playerId = playerIdBySourceId.get(sourceAthleteId) ?? null
			if (!playerId) unlinkedAthletes += 1

			for (const [statKey, valueText] of athlete.stats) {
				playerRows.push({
					...common,
					...side,
					sourceAthleteId,
					playerId,
					didNotPlay: athlete.didNotPlay,
					starter: athlete.starter,
					statKey,
					valueText,
					valueNumeric: numericFor(parsers, "athlete", statKey, valueText),
				})
			}
		}

		const teamRows: (typeof teamGameStats.$inferInsert)[] = []
		const collectTeamRows = (
			scope: TeamGameStat["scope"],
			origin: BoxStatSource["origin"],
			byEspnTeamId: Map<string, Map<string, string>>,
		) => {
			for (const [espnTeamId, stats] of byEspnTeamId) {
				const side = sideOf(espnTeamId)
				if (!side) continue
				for (const [statKey, valueText] of stats) {
					teamRows.push({
						...common,
						...side,
						scope,
						statKey,
						valueText,
						valueNumeric: numericFor(parsers, origin, statKey, valueText),
					})
				}
			}
		}
		collectTeamRows("team_box", "team_box", box.teamStats)
		// The final score, as a one-key team stat. Not a box-score cell, but
		// storing it here is what lets "team points" be an ordinary stat
		// question rather than a special case in every query.
		collectTeamRows(
			"final_score",
			"final_score",
			new Map(
				[...box.scoreByEspnTeamId].map(([espnTeamId, score]) => [
					espnTeamId,
					new Map([["score", String(score)]]),
				]),
			),
		)
		collectTeamRows("player_table_total", "player_table_total", box.tableTotals)
		for (const [espnTeamId, periods] of box.periodScores) {
			const side = sideOf(espnTeamId)
			if (!side) continue
			for (const [statKey, valueText] of periods) {
				teamRows.push({
					...common,
					...side,
					scope: "period",
					statKey,
					valueText,
					valueNumeric: parseStatNumber(valueText),
				})
			}
		}

		await tx.delete(playerGameStats).where(eq(playerGameStats.gameId, game.id))
		await tx.delete(teamGameStats).where(eq(teamGameStats.gameId, game.id))

		for (let i = 0; i < playerRows.length; i += INSERT_CHUNK) {
			await tx
				.insert(playerGameStats)
				.values(playerRows.slice(i, i + INSERT_CHUNK))
		}
		for (let i = 0; i < teamRows.length; i += INSERT_CHUNK) {
			await tx.insert(teamGameStats).values(teamRows.slice(i, i + INSERT_CHUNK))
		}

		await tx
			.update(games)
			.set({ boxScoreSyncedAt: now })
			.where(eq(games.id, game.id))

		return {
			playerRows: playerRows.length,
			teamRows: teamRows.length,
			unlinkedAthletes,
		}
	})
}
