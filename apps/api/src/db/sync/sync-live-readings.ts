import { autoResolutionSource } from "@called-my-shot/schemas"
import { sql } from "drizzle-orm"
import { applyDecision, autoResolveNotes } from "../../lib/auto-resolve/apply"
import type { Decision } from "../../lib/auto-resolve/decide"
import {
	decidedEarly,
	readLiveGameQuestion,
} from "../../lib/auto-resolve/live"
import { SYNC_LIVE_READINGS_LOCK } from "../../lib/job-lock"
import { runCli } from "../../lib/run-cli"
import { MINUTE_MS } from "../../lib/time"
import { db } from "../index"
import { questionLiveReadings } from "../schema"
import { parseBoxScore } from "./box-score-parse"
import {
	defaultEspnClient,
	type EspnClient,
	EspnRequestError,
} from "./espn-client"
import {
	createEspnRequester,
	DEFAULT_ESPN_SPACING_MS,
	type EspnRequester,
} from "./espn-requester"
import {
	espnBoxScoreUrl,
	gameExtractorFor,
	loadGameEspnRefs,
	loadGameSources,
} from "./game-sources"
import { SYNCED_LEAGUES } from "./leagues"

const NAME = "sync-live-readings"

const NOTES = autoResolveNotes("ESPN's box score")

// How long a result has to stay decided before it settles mid-game. Just
// under this job's five-minute spacing, so it settles on the pass after the
// one that first saw it, by which point a replay review that took the play
// back would have shown up in the box score.
export const CLINCH_HOLD_MS = 4 * MINUTE_MS

// Unsettled questions the automatic resolver will settle, on games being
// played right now. Those are exactly the ones whose stat the box score
// carries, so they're the ones a reading can be taken for.
const loadLiveQuestions = () =>
	db.query.questions.findMany({
		where: {
			resolutionMode: "system",
			status: { in: ["open", "locked"] },
			game: { status: "live" },
		},
		with: { game: true, league: true, stat: true, options: true },
	})

type LiveQuestion = Awaited<ReturnType<typeof loadLiveQuestions>>[number]

// Reads one game's in-progress box score, plus whatever else its questions'
// stats need, once, and stores where each question stands. A question with
// nothing to show this pass keeps its last reading rather than losing it to a
// failed fetch. A question whose result is already decided, and has held,
// settles now rather than waiting on the final (see decidedEarly).
async function readGame(
	group: LiveQuestion[],
	{
		now,
		espn,
		requester,
	}: { now: Date; espn: EspnClient; requester: EspnRequester },
): Promise<{ stored: number; settled: number }> {
	const nothing = { stored: 0, settled: 0 }
	const game = group[0]?.game
	const league = group[0]?.league
	if (!game || !league) return nothing

	const config = SYNCED_LEAGUES.find((c) => c.leagueSlug === league.slug)
	const refs = await loadGameEspnRefs(game, group)
	const espnEventId = refs.espnEventId
	if (!config || !espnEventId) return nothing

	const summary = await requester.request(
		`${league.slug} summary ${espnEventId}`,
		() => espn.fetchGameSummary(config.espnPath, espnEventId),
	)
	if (!summary) return nothing
	const box = parseBoxScore(summary)

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

	const clinched = new Map<string, Decision>()
	const rows = planned.flatMap(({ question, extractor }) => {
		if (extractor?.needs.some((need) => failedNeeds.has(need))) return []
		const ctx = {
			question,
			options: question.options,
			extractor,
			sources,
			espnAthleteIdByPlayerId: refs.espnAthleteIdByPlayerId,
			playerIdByEspnAthleteId: refs.playerIdByEspnAthleteId,
			espnTeamIdByTeamId: refs.espnTeamIdByTeamId,
			homeTeamId: game.homeTeamId,
			awayTeamId: game.awayTeamId,
		}
		const reading = readLiveGameQuestion(ctx)
		if (!reading) return []
		// Never while calls can still be made on it.
		const decision = question.locksAt <= now ? decidedEarly(ctx) : null
		if (decision) clinched.set(question.id, decision)
		return [
			{
				questionId: question.id,
				...reading,
				clinchedSince: decision ? now : null,
				updatedAt: now,
			},
		]
	})
	if (rows.length === 0) return nothing

	const stored = await db
		.insert(questionLiveReadings)
		.values(rows)
		.onConflictDoUpdate({
			target: questionLiveReadings.questionId,
			set: {
				value: sql`excluded.value`,
				optionValues: sql`excluded.option_values`,
				clinchedSince: sql`case when excluded.clinched_since is null then null else coalesce(${questionLiveReadings.clinchedSince}, excluded.clinched_since) end`,
				updatedAt: sql`excluded.updated_at`,
			},
		})
		.returning({
			questionId: questionLiveReadings.questionId,
			clinchedSince: questionLiveReadings.clinchedSince,
		})

	const held = stored.filter(
		({ clinchedSince }) =>
			clinchedSince !== null &&
			now.getTime() - clinchedSince.getTime() >= CLINCH_HOLD_MS,
	)
	for (const { questionId } of held) {
		const decision = clinched.get(questionId)
		if (!decision) continue
		await applyDecision(questionId, decision, {
			now,
			// Only a resolve gets here, and a resolve never escalates.
			escalateAt: now,
			resolutionSource: autoResolutionSource("game"),
			resolutionSourceUrl: espnBoxScoreUrl(league.slug, espnEventId),
			...NOTES,
			midGame: true,
		})
	}
	return { stored: rows.length, settled: held.length }
}

// Takes a reading of every live game's questions. Runs right after
// sync-live-scores, which is what moves a game to live and back out of it.
// ESPN refusing us ends the run; any other failure is that one game's problem.
export async function syncLiveReadings({
	now = new Date(),
	spacingMs = DEFAULT_ESPN_SPACING_MS,
	espn = defaultEspnClient,
}: {
	now?: Date
	spacingMs?: number
	espn?: EspnClient
} = {}): Promise<void> {
	const questions = await loadLiveQuestions()
	if (questions.length === 0) return

	const groups = new Map<string, LiveQuestion[]>()
	for (const question of questions) {
		if (!question.gameId) continue
		groups.set(question.gameId, [
			...(groups.get(question.gameId) ?? []),
			question,
		])
	}

	const requester = createEspnRequester(NAME, spacingMs)
	let stored = 0
	let settled = 0
	for (const [gameId, group] of groups) {
		try {
			const read = await readGame(group, { now, espn, requester })
			stored += read.stored
			settled += read.settled
		} catch (err) {
			if (err instanceof EspnRequestError) throw err
			console.error(`[${NAME}] game ${gameId} failed:`, err)
		}
	}

	console.log(
		`[${NAME}] ${stored} reading(s) across ${groups.size} game(s), ${settled} settled mid-game, ${requester.count()} ESPN request(s)`,
	)
}

runCli(import.meta.url, syncLiveReadings, { lock: SYNC_LIVE_READINGS_LOCK })
