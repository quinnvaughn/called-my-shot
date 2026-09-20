import {
	autoResolutionSource,
	autoResolveStatKeyFor,
} from "@called-my-shot/schemas"
import {
	type ApplyContext,
	applyDecision,
	isAttemptDue,
} from "../../lib/auto-resolve/apply"
import {
	type Decision,
	decideFinalScore,
	decideGameQuestion,
	fail,
} from "../../lib/auto-resolve/decide"
import {
	EXTRACTORS,
	type GameExtractor,
	type GameSourceNeed,
	type GameSources,
} from "../../lib/auto-resolve/registry"
import { isMainModule } from "../../lib/is-main-module"
import { db } from "../index"
import { parseBoxScore } from "./box-score-parse"
import { persistBoxScore } from "./box-score-store"
import {
	EspnRequestError,
	fetchCompetitorAthleteStatistics,
	fetchCompetitorRoster,
	fetchGameSummary,
} from "./espn-client"
import {
	createEspnRequester,
	DEFAULT_ESPN_SPACING_MS,
	type EspnRequester,
} from "./espn-requester"
import { SYNCED_LEAGUES } from "./leagues"

const HOUR_MS = 60 * 60 * 1000

// How long past the game going final a retryable failure keeps being retried
// before the question is handed to an admin.
export const ESCALATE_AFTER_MS = 12 * HOUR_MS

const RESOLVED_NOTE = "Resolved automatically from ESPN's box score."
const VOIDED_NOTE =
	"Voided automatically: ESPN's box score shows the player didn't play."

const CANDIDATE_RELATIONS = {
	game: true,
	league: true,
	stat: true,
	options: true,
	autoResolution: true,
} as const

// System questions on final games: the ones still waiting on a result, and
// settled ones whose re-check is due. A box score that isn't complete yet fails
// as box_score_not_final and is retried, and a stat ESPN corrects later is
// caught by the re-check. team_vs_team is settled by resolveGameWinner the
// moment the game goes final, so only its re-check comes through here.
async function loadCandidates(now: Date) {
	const game = { status: "final" } as const
	const [unsettled, awaitingRecheck] = await Promise.all([
		db.query.questions.findMany({
			where: {
				resolutionMode: "system",
				shape: { ne: "team_vs_team" },
				status: { in: ["open", "locked"] },
				locksAt: { lte: now },
				game,
			},
			with: CANDIDATE_RELATIONS,
		}),
		db.query.questions.findMany({
			where: {
				resolutionMode: "system",
				resolutionMethod: "system",
				status: { in: ["resolved", "voided"] },
				game,
				autoResolution: {
					recheckDueAt: { lte: now },
					recheckedAt: { isNull: true },
				},
			},
			with: CANDIDATE_RELATIONS,
		}),
	])

	return [...unsettled, ...awaitingRecheck].filter((question) =>
		isAttemptDue(question, now),
	)
}

type Candidate = Awaited<ReturnType<typeof loadCandidates>>[number]

const subjectPlayerIds = (question: Candidate) =>
	[question.subjectPlayerId, ...question.options.map((o) => o.playerId)].filter(
		(id): id is string => id !== null,
	)

const espnIdOf = (sourceId: string) => sourceId.split(":")[1] ?? sourceId

async function loadEspnRefs(
	game: { id: string; homeTeamId: string; awayTeamId: string },
	group: Candidate[],
) {
	const playerIds = [...new Set(group.flatMap(subjectPlayerIds))]
	const [gameRef, teamRefs, playerRefs] = await Promise.all([
		db.query.externalRefs.findFirst({
			where: { source: "espn", entityType: "game", entityId: game.id },
		}),
		db.query.externalRefs.findMany({
			where: {
				source: "espn",
				entityType: "team",
				entityId: { in: [game.homeTeamId, game.awayTeamId] },
			},
		}),
		playerIds.length > 0
			? db.query.externalRefs.findMany({
					where: {
						source: "espn",
						entityType: "player",
						entityId: { in: playerIds },
					},
				})
			: [],
	])
	return {
		espnEventId: gameRef ? espnIdOf(gameRef.sourceId) : null,
		espnTeamIdByTeamId: new Map(
			teamRefs.map((ref) => [ref.entityId, espnIdOf(ref.sourceId)]),
		),
		espnAthleteIdByPlayerId: new Map(
			playerRefs.map((ref) => [ref.entityId, espnIdOf(ref.sourceId)]),
		),
		playerIdByEspnAthleteId: new Map(
			playerRefs.map((ref) => [espnIdOf(ref.sourceId), ref.entityId]),
		),
	}
}

function extractorFor(
	question: Candidate,
	leagueSlug: string,
): GameExtractor | null {
	const key = autoResolveStatKeyFor({
		shape: question.shape,
		leagueSlug,
		statName: question.stat?.name,
		customStat: question.customStat,
		statAggregation: question.statAggregation,
	})
	const extractor = key ? EXTRACTORS[key] : null
	return extractor?.scope === "game" ? extractor : null
}

// Reads one game's box score, plus whatever else its questions' stats need,
// once, then settles each question from it.
async function processGame(
	group: Candidate[],
	requester: EspnRequester,
	now: Date,
): Promise<void> {
	const game = group[0]?.game
	const league = group[0]?.league
	if (!game || !league) return
	const contextFor = (resolutionSourceUrl: string | null): ApplyContext => ({
		now,
		escalateAt: new Date(
			(game.finalizedAt ?? now).getTime() + ESCALATE_AFTER_MS,
		),
		resolutionSource: autoResolutionSource("game"),
		resolutionSourceUrl,
		resolvedNote: RESOLVED_NOTE,
		voidedNote: VOIDED_NOTE,
	})
	const applyAll = async (decision: Decision) => {
		for (const question of group) {
			await applyDecision(question.id, decision, contextFor(null))
		}
	}

	const config = SYNCED_LEAGUES.find((c) => c.leagueSlug === league.slug)
	const refs = await loadEspnRefs(game, group)
	const espnEventId = refs.espnEventId
	if (!config || !espnEventId) {
		await applyAll(fail("missing_external_ref", "no ESPN event for this game"))
		return
	}

	const summary = await requester.request(
		`${league.slug} summary ${espnEventId}`,
		() => fetchGameSummary(config.espnPath, espnEventId),
	)
	if (!summary) {
		await applyAll(fail("fetch_failed", "couldn't fetch the box score"))
		return
	}
	const box = parseBoxScore(summary)
	if (!box.isFinal) {
		await applyAll(
			fail("box_score_not_final", "ESPN's box score isn't final yet"),
		)
		return
	}

	const planned = group.map((question) => ({
		question,
		extractor: extractorFor(question, league.slug),
	}))
	const needs = new Set(planned.flatMap((p) => p.extractor?.needs ?? []))
	const failedNeeds = new Set<GameSourceNeed>()
	const sources: GameSources = {
		box,
		didNotPlayByTeam: new Map(),
		athleteGameStats: new Map(),
	}

	if (needs.has("roster")) {
		for (const espnTeamId of refs.espnTeamIdByTeamId.values()) {
			const roster = await requester.request(
				`${league.slug} roster ${espnEventId}/${espnTeamId}`,
				() => fetchCompetitorRoster(config.espnPath, espnEventId, espnTeamId),
			)
			if (!roster) {
				failedNeeds.add("roster")
				continue
			}
			sources.didNotPlayByTeam.set(
				espnTeamId,
				new Map(roster.map((e) => [String(e.playerId), e.didNotPlay === true])),
			)
		}
	}

	if (needs.has("athleteGameStats")) {
		const espnAthleteIds = new Set(
			planned
				.filter((p) => p.extractor?.needs.includes("athleteGameStats"))
				.flatMap((p) => subjectPlayerIds(p.question))
				.flatMap(
					(playerId) => refs.espnAthleteIdByPlayerId.get(playerId) ?? [],
				),
		)
		for (const espnAthleteId of espnAthleteIds) {
			// Not in the box score means they didn't appear, which the extractor
			// reads without these stats.
			const athlete = box.athletes.get(espnAthleteId)
			if (!athlete) continue
			const stats = await requester.request(
				`${league.slug} athlete ${espnAthleteId}`,
				() =>
					fetchCompetitorAthleteStatistics(
						config.espnPath,
						espnEventId,
						athlete.espnTeamId,
						espnAthleteId,
					),
			)
			if (!stats) {
				failedNeeds.add("athleteGameStats")
				continue
			}
			sources.athleteGameStats.set(
				espnAthleteId,
				new Map(
					stats.splits.categories.flatMap((category) =>
						category.stats.map(
							(stat) => [`${category.name}.${stat.name}`, stat.value] as const,
						),
					),
				),
			)
		}
	}

	const ctx = contextFor(
		`https://www.espn.com/${league.slug}/boxscore/_/gameId/${espnEventId}`,
	)
	for (const { question, extractor } of planned) {
		const decision =
			question.shape === "team_vs_team"
				? decideFinalScore({
						options: question.options,
						box,
						espnTeamIdByTeamId: refs.espnTeamIdByTeamId,
					})
				: !extractor
					? fail(
							"unmapped",
							"this question's stat doesn't settle automatically",
						)
					: extractor.needs.some((need) => failedNeeds.has(need))
						? fail("fetch_failed", "couldn't fetch everything the stat needs")
						: decideGameQuestion({
								question,
								options: question.options,
								extractor,
								sources,
								espnAthleteIdByPlayerId: refs.espnAthleteIdByPlayerId,
								playerIdByEspnAthleteId: refs.playerIdByEspnAthleteId,
								espnTeamIdByTeamId: refs.espnTeamIdByTeamId,
								homeTeamId: game.homeTeamId,
								awayTeamId: game.awayTeamId,
							})
		await applyDecision(question.id, decision, ctx)
	}

	// Last, deliberately. The box score is already fetched and parsed, so
	// storing it costs nothing beyond the write - but it's a few hundred rows
	// per game, and resolution is the critical path while stat context is not.
	// Settling every question first means a slow or failing write can only
	// delay a game log, never a caller's result. A failure leaves
	// boxScoreSyncedAt null, which is exactly what sync-box-scores looks for.
	try {
		await persistBoxScore({
			game,
			leagueSlug: league.slug,
			box,
			espnTeamIdByTeamId: refs.espnTeamIdByTeamId,
			now,
		})
	} catch (error) {
		console.error(
			`[auto-resolve-games] couldn't store the box score for game ${game.id}:`,
			error,
		)
	}
}

export async function autoResolveGames({
	now = new Date(),
	spacingMs = DEFAULT_ESPN_SPACING_MS,
}: {
	now?: Date
	spacingMs?: number
} = {}): Promise<void> {
	const candidates = await loadCandidates(now)
	if (candidates.length === 0) {
		console.log("[auto-resolve-games] nothing due")
		return
	}

	const byGame = new Map<string, Candidate[]>()
	for (const question of candidates) {
		if (!question.gameId) continue
		byGame.set(question.gameId, [
			...(byGame.get(question.gameId) ?? []),
			question,
		])
	}

	const requester = createEspnRequester("auto-resolve-games", spacingMs)
	for (const [gameId, group] of byGame) {
		try {
			await processGame(group, requester, now)
		} catch (err) {
			// ESPN refusing us ends the run; anything else is one game's problem.
			if (err instanceof EspnRequestError) throw err
			console.error(`[auto-resolve-games] game ${gameId} failed:`, err)
		}
	}

	console.log(
		`[auto-resolve-games] ${candidates.length} question(s) across ${byGame.size} game(s), ${requester.count()} ESPN request(s)`,
	)
}

if (isMainModule(import.meta.url)) {
	autoResolveGames()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error(err)
			process.exit(1)
		})
}
