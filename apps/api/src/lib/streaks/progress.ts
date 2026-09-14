import { SWEEP_MIN_GAMES } from "@called-my-shot/scoring"
import { db } from "../../db"
import type { Game, Question } from "../../db/schema"
import { callOutcome, canonicalWinnerQuestion, type Outcome } from "./compute"
import { buildSlateKey } from "./slate"

export type SlateProgressGame = {
	gameId: string
	status: Question["status"]
	// Taking no more picks: locked, or past its lock time before the lock job
	// has caught up.
	locked: boolean
	called: boolean
	outcome: Outcome
}

export type SlateProgress = {
	// alive: every game so far is called and nothing has missed. off: a game
	// locked without a pick, or a pick missed. swept: every game called right.
	status: "alive" | "off" | "swept"
	gameCount: number
	calledCount: number
	winCount: number
	lossCount: number
	pendingCount: number
	missedGameIds: string[]
	lostGameIds: string[]
}

// Where a viewer stands on sweeping a slate that may still be in progress - the
// same rules computeSlateSweeps settles a finished slate by, read while it's
// still being played. Null for a slate too small to sweep.
export function slateProgress(
	games: SlateProgressGame[],
): SlateProgress | null {
	const counted = games.filter((g) => g.status !== "voided")
	if (counted.length < SWEEP_MIN_GAMES) return null

	const missedGameIds = counted
		.filter((g) => g.locked && !g.called)
		.map((g) => g.gameId)
	const lostGameIds = counted
		.filter((g) => g.outcome === "loss")
		.map((g) => g.gameId)
	const winCount = counted.filter((g) => g.outcome === "win").length
	const settledCount = counted.filter(
		(g) => g.status === "resolved" || g.status === "disputed",
	).length

	const status =
		missedGameIds.length > 0 || lostGameIds.length > 0
			? "off"
			: winCount === counted.length
				? "swept"
				: settledCount === counted.length
					? "off"
					: "alive"

	return {
		status,
		gameCount: counted.length,
		calledCount: counted.filter((g) => g.called).length,
		winCount,
		lossCount: lostGameIds.length,
		pendingCount: counted.length - settledCount,
		missedGameIds,
		lostGameIds,
	}
}

// The viewer's progress on the slate a group of games makes up, e.g. one slot
// on the Games tab. Null when the games don't make up exactly one slate -
// unslotted week-league games spread over several days have no single sweep
// to track.
export async function loadSlateProgress(
	userId: string,
	games: Game[],
	now: Date = new Date(),
): Promise<(SlateProgress & { slateKey: string }) | null> {
	const [first] = games
	if (!first) return null
	const [league, season] = await Promise.all([
		db.query.leagues.findFirst({
			where: { id: first.leagueId },
			columns: { slug: true, windowType: true },
		}),
		db.query.seasons.findFirst({
			where: { id: first.seasonId },
			columns: { year: true },
		}),
	])
	if (!league || !season) return null

	const slateKeys = new Set(
		games.map((game) => buildSlateKey(game, league.windowType, season.year)),
	)
	const [slateKey] = slateKeys
	if (slateKeys.size !== 1 || !slateKey) return null

	const questions = await db.query.questions.findMany({
		where: {
			gameId: { in: games.map((game) => game.id) },
			shape: "team_vs_team",
		},
		columns: {
			id: true,
			gameId: true,
			generationKey: true,
			isOfficial: true,
			resolutionMode: true,
			createdAt: true,
			status: true,
			locksAt: true,
		},
		with: {
			calls: {
				where: { userId },
				columns: { unscoredReason: true, hitTolerance: true },
				with: {
					selections: {
						columns: { id: true },
						with: { option: { columns: { isCorrect: true } } },
					},
				},
			},
		},
	})

	const progressGames = games.flatMap((game): SlateProgressGame[] => {
		const question = canonicalWinnerQuestion(
			league.slug,
			game.id,
			questions.filter((q) => q.gameId === game.id),
		)
		if (!question) return []
		const [call] = question.calls
		return [
			{
				gameId: game.id,
				status: question.status,
				locked: question.status !== "open" || question.locksAt <= now,
				called: call !== undefined,
				outcome: call
					? callOutcome({
							shape: "team_vs_team",
							status: question.status,
							unscoredReason: call.unscoredReason,
							hitTolerance: call.hitTolerance,
							selectionsCorrect: call.selections.map(
								(s) => s.option?.isCorrect ?? null,
							),
						})
					: "skip",
			},
		]
	})

	const progress = slateProgress(progressGames)
	return progress ? { ...progress, slateKey } : null
}
