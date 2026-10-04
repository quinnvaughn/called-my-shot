import { sql } from "drizzle-orm"
import { readLiveGameQuestion } from "../../lib/auto-resolve/live"
import { SYNC_LIVE_READINGS_LOCK } from "../../lib/job-lock"
import { runCli } from "../../lib/run-cli"
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
	gameExtractorFor,
	loadGameEspnRefs,
	loadGameSources,
} from "./game-sources"
import { SYNCED_LEAGUES } from "./leagues"

const NAME = "sync-live-readings"

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
// failed fetch.
async function readGame(
	group: LiveQuestion[],
	{
		now,
		espn,
		requester,
	}: { now: Date; espn: EspnClient; requester: EspnRequester },
): Promise<number> {
	const game = group[0]?.game
	const league = group[0]?.league
	if (!game || !league) return 0

	const config = SYNCED_LEAGUES.find((c) => c.leagueSlug === league.slug)
	const refs = await loadGameEspnRefs(game, group)
	const espnEventId = refs.espnEventId
	if (!config || !espnEventId) return 0

	const summary = await requester.request(
		`${league.slug} summary ${espnEventId}`,
		() => espn.fetchGameSummary(config.espnPath, espnEventId),
	)
	if (!summary) return 0
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

	const rows = planned.flatMap(({ question, extractor }) => {
		if (extractor?.needs.some((need) => failedNeeds.has(need))) return []
		const reading = readLiveGameQuestion({
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
		return reading ? [{ questionId: question.id, ...reading, updatedAt: now }] : []
	})
	if (rows.length === 0) return 0

	await db
		.insert(questionLiveReadings)
		.values(rows)
		.onConflictDoUpdate({
			target: questionLiveReadings.questionId,
			set: {
				value: sql`excluded.value`,
				optionValues: sql`excluded.option_values`,
				updatedAt: sql`excluded.updated_at`,
			},
		})
	return rows.length
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
	for (const [gameId, group] of groups) {
		try {
			stored += await readGame(group, { now, espn, requester })
		} catch (err) {
			if (err instanceof EspnRequestError) throw err
			console.error(`[${NAME}] game ${gameId} failed:`, err)
		}
	}

	console.log(
		`[${NAME}] ${stored} reading(s) across ${groups.size} game(s), ${requester.count()} ESPN request(s)`,
	)
}

runCli(import.meta.url, syncLiveReadings, { lock: SYNC_LIVE_READINGS_LOCK })
