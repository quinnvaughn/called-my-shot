import { fieldPct } from "@called-my-shot/scoring"
import { count, inArray } from "drizzle-orm"
import { callSelections, callStreakPositions, calls } from "../../db/schema"
import type { DbOrTx } from "../../db/types"
import { gameEntryVerdict, loadGameEntry } from "../game-entry"
import type { CallFacts, PresserFacts } from "./templates"

function formatGuess(value: number): string {
	return String(Number(value.toFixed(3)))
}

// Everything pickAppQuestions asks about one user's scored calls on a game.
// Null when the game is gone or none of their calls on it scored.
export async function loadPresserFacts(
	q: DbOrTx,
	userId: string,
	gameId: string,
): Promise<PresserFacts | null> {
	const game = await q.query.games.findFirst({
		where: { id: gameId },
		with: {
			homeTeam: { columns: { abbreviation: true } },
			awayTeam: { columns: { abbreviation: true } },
		},
	})
	if (!game) return null

	const rows = await q.query.calls.findMany({
		where: { userId, question: { gameId } },
		with: {
			question: {
				columns: { id: true, status: true, shape: true, createdAt: true },
			},
			selections: {
				with: {
					option: { columns: { label: true, isCorrect: true, teamId: true } },
				},
			},
			redo: { with: { selections: { columns: { optionId: true } } } },
		},
	})
	const scored = rows.filter(
		(row) =>
			row.unscoredReason === null &&
			(row.question?.status === "resolved" ||
				row.question?.status === "disputed"),
	)
	if (scored.length === 0) return null
	const callIds = scored.map((row) => row.id)

	const singleOptionIds = scored.flatMap((row) =>
		row.selections.length === 1 ? [row.selections[0].optionId] : [],
	)
	const questionIds = [...new Set(scored.map((row) => row.questionId))]
	const [optionCounts, questionCounts, streaks] = await Promise.all([
		singleOptionIds.length > 0
			? q
					.select({ optionId: callSelections.optionId, n: count() })
					.from(callSelections)
					.where(inArray(callSelections.optionId, singleOptionIds))
					.groupBy(callSelections.optionId)
			: Promise.resolve([]),
		q
			.select({ questionId: calls.questionId, n: count() })
			.from(calls)
			.where(inArray(calls.questionId, questionIds))
			.groupBy(calls.questionId),
		q
			.select({
				callId: callStreakPositions.callId,
				length: callStreakPositions.length,
			})
			.from(callStreakPositions)
			.where(inArray(callStreakPositions.callId, callIds)),
	])
	const optionCount = new Map(optionCounts.map((row) => [row.optionId, row.n]))
	const questionCount = new Map(
		questionCounts.map((row) => [row.questionId, row.n]),
	)
	const streakByCall = new Map(streaks.map((row) => [row.callId, row.length]))

	const callFacts: CallFacts[] = scored.map((row) => {
		// The same reading as tallyCalls.
		const won =
			row.hitTolerance ??
			row.selections.some((s) => s.option?.isCorrect === true)
		const resultPoints =
			row.resultPoints ??
			row.selections.reduce((sum, s) => sum + (s.resultPoints ?? 0), 0)
		const [only] = row.selections
		const single = row.selections.length === 1 ? only : null

		const pickLabel =
			row.guessValue !== null
				? formatGuess(row.guessValue)
				: row.selections.map((s) => s.option?.label ?? "").join(" and ")

		let lostBy: number | null = null
		const pickedTeam = single?.option?.teamId
		if (
			!won &&
			row.question?.shape === "team_vs_team" &&
			pickedTeam &&
			game.homeScore !== null &&
			game.awayScore !== null
		) {
			const own =
				pickedTeam === game.homeTeamId ? game.homeScore : game.awayScore
			const other =
				pickedTeam === game.homeTeamId ? game.awayScore : game.homeScore
			if (
				(pickedTeam === game.homeTeamId || pickedTeam === game.awayTeamId) &&
				own < other
			) {
				lostBy = other - own
			}
		}

		const originalOptions = row.redo?.selections.map((s) => s.optionId) ?? []
		const currentOptions = row.selections.map((s) => s.optionId)
		const redoFlipped =
			row.redo !== null &&
			row.redo !== undefined &&
			originalOptions.length > 0 &&
			(originalOptions.length !== currentOptions.length ||
				originalOptions.some((id) => !currentOptions.includes(id)))

		const total = questionCount.get(row.questionId) ?? 0
		const convictions = [
			...(row.conviction !== null ? [row.conviction] : []),
			...row.selections.map((s) => s.conviction),
		]

		return {
			callId: row.id,
			pickLabel,
			won,
			resultPoints,
			conviction: convictions.length > 0 ? Math.max(...convictions) : null,
			fieldSharePct:
				single && total > 0
					? fieldPct(optionCount.get(single.optionId) ?? 0, total)
					: null,
			closenessFieldPct: won ? row.closenessFieldPct : null,
			lostBy,
			redoFlipped,
			streakLength: won ? (streakByCall.get(row.id) ?? null) : null,
			questionCreatedAt: row.question?.createdAt ?? row.createdAt,
		}
	})

	const entry = await loadGameEntry(gameId, userId)
	return {
		matchup:
			game.awayTeam && game.homeTeam
				? `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`
				: "this game",
		wins: entry?.wins ?? 0,
		losses: entry?.losses ?? 0,
		points: entry?.points ?? 0,
		verdict: entry ? gameEntryVerdict(entry.official, game.status) : null,
		calls: callFacts,
	}
}

// Whether a user's calls on a game have all settled with at least one scored,
// on a game that's final - the moment their presser opens. A call on a voided
// question, or one the creator couldn't score, counts as settled but not
// scored.
export async function presserEligible(
	q: DbOrTx,
	userId: string,
	gameId: string,
): Promise<boolean> {
	const game = await q.query.games.findFirst({
		where: { id: gameId },
		columns: { status: true },
	})
	if (game?.status !== "final") return false

	const rows = await q.query.calls.findMany({
		where: { userId, question: { gameId } },
		columns: { unscoredReason: true },
		with: { question: { columns: { status: true } } },
	})
	let scored = 0
	for (const row of rows) {
		if (row.unscoredReason !== null) continue
		const status = row.question?.status
		if (status === "open" || status === "locked") return false
		if (status === "resolved" || status === "disputed") scored++
	}
	return scored > 0
}
