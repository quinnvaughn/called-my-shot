import { autoResolutionSource } from "@called-my-shot/schemas"
import { autoResolveNotes } from "../../lib/auto-resolve/apply"
import {
	decideFinalScore,
	decideGameQuestion,
	fail,
} from "../../lib/auto-resolve/decide"
import { AUTO_RESOLVE_GAMES_LOCK } from "../../lib/job-lock"
import { runCli } from "../../lib/run-cli"
import { HOUR_MS } from "../../lib/time"
import { db } from "../index"
import {
	type AutoResolveJobOptions,
	type AutoResolveRun,
	applierFor,
	loadDueCandidates,
	runAutoResolveJob,
} from "./auto-resolve-job"
import { parseBoxScore } from "./box-score-parse"
import { persistBoxScore } from "./box-score-store"
import {
	gameExtractorFor,
	loadGameEspnRefs,
	loadGameSources,
} from "./game-sources"
import { SYNCED_LEAGUES } from "./leagues"

// How long past the game going final a retryable failure keeps being retried
// before the question is handed to an admin.
export const ESCALATE_AFTER_MS = 12 * HOUR_MS

const NOTES = autoResolveNotes("ESPN's box score")

// System questions on final games: the ones still waiting on a result, and
// settled ones whose re-check is due. A box score that isn't complete yet fails
// as box_score_not_final and is retried, and a stat ESPN corrects later is
// caught by the re-check. team_vs_team is settled by resolveGameWinner the
// moment the game goes final, so only its re-check comes through here.
const loadCandidates = (now: Date) =>
	loadDueCandidates(now, (due, phase) =>
		db.query.questions.findMany({
			where: {
				resolutionMode: "system",
				game: { status: "final" },
				...(phase === "unsettled"
					? { shape: { ne: "team_vs_team" as const } }
					: {}),
				...due,
			},
			with: {
				game: true,
				league: true,
				stat: true,
				options: true,
				autoResolution: true,
			},
		}),
	)

type Candidate = Awaited<ReturnType<typeof loadCandidates>>[number]

// Reads one game's box score, plus whatever else its questions' stats need,
// once, then settles each question from it.
async function processGame(
	group: Candidate[],
	{ now, espn, requester }: AutoResolveRun,
): Promise<void> {
	const game = group[0]?.game
	const league = group[0]?.league
	if (!game || !league) return
	const { apply, applyAll } = applierFor(group, {
		now,
		escalateAt: new Date(
			(game.finalizedAt ?? now).getTime() + ESCALATE_AFTER_MS,
		),
		resolutionSource: autoResolutionSource("game"),
		...NOTES,
	})

	const config = SYNCED_LEAGUES.find((c) => c.leagueSlug === league.slug)
	const refs = await loadGameEspnRefs(game, group)
	const espnEventId = refs.espnEventId
	if (!config || !espnEventId) {
		await applyAll(fail("missing_external_ref", "no ESPN event for this game"))
		return
	}

	const summary = await requester.request(
		`${league.slug} summary ${espnEventId}`,
		() => espn.fetchGameSummary(config.espnPath, espnEventId),
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
		extractor: gameExtractorFor(question, league.slug),
	}))
	const { sources, failedNeeds } = await loadGameSources({
		box,
		planned,
		refs,
		espnEventId,
		leagueSlug: league.slug,
		espnPath: config.espnPath,
		espn,
		requester,
	})

	const boxScoreUrl = `https://www.espn.com/${league.slug}/boxscore/_/gameId/${espnEventId}`
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
		await apply(question.id, decision, boxScoreUrl)
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

export function autoResolveGames(
	options: AutoResolveJobOptions = {},
): Promise<void> {
	return runAutoResolveJob(
		{
			name: "auto-resolve-games",
			unit: "game",
			loadCandidates,
			groupKey: (question) => question.gameId,
			processGroup: processGame,
		},
		options,
	)
}

runCli(import.meta.url, autoResolveGames, { lock: AUTO_RESOLVE_GAMES_LOCK })
