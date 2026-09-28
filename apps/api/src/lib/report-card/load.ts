import { isNumericGuessShape } from "@called-my-shot/scoring"
import { and, eq } from "drizzle-orm"
import { db } from "../../db"
import { type Call, type Game, games, type League } from "../../db/schema"
import { type WindowDescriptor, windowGameFilter } from "../windows"
import {
	buildReportCard,
	type ReportCard,
	type ReportCardCall,
	type ReportCardGame,
} from "./compute"

// Reads the rows ./compute.ts folds. Two queries regardless of how big the
// window is: the games it holds, then every call the viewer made on a
// question anchored to one of them.

async function windowGameIds(
	league: League,
	window: WindowDescriptor,
): Promise<string[]> {
	const rows = await db
		.select({ id: games.id })
		.from(games)
		.where(and(eq(games.leagueId, league.id), windowGameFilter(window)))
	return rows.map((row) => row.id)
}

// The shape of a call row as the report card and track record both load it.
type LoadedCall = {
	id: string
	conviction: number | null
	hitTolerance: boolean | null
	resultPoints: number | null
	unscoredReason: ReportCardCall["unscoredReason"]
	createdAt: Date
	selections: {
		conviction: number
		resultPoints: number | null
		option: { isCorrect: boolean | null; lossRate: number | null } | null
	}[]
}

export function toReportCardCall(
	question: Pick<ReportCardCall, "gameId" | "shape" | "status" | "lossRate">,
	call: LoadedCall,
): ReportCardCall {
	const numeric = isNumericGuessShape(question.shape)
	return {
		callId: call.id,
		gameId: question.gameId,
		shape: question.shape,
		status: question.status,
		unscoredReason: call.unscoredReason,
		hitTolerance: call.hitTolerance,
		lossRate: question.lossRate,
		// The trap this whole module exists around: calls.resultPoints is
		// null for every option shape, which scores through call_selections
		// instead (see the comment on `calls` in db/schema/calls.ts). Reading
		// the call column alone reports a near-zero net for almost every
		// caller, silently. Same resolution CallRef.totalPoints already uses.
		netPoints:
			call.resultPoints ??
			(call.selections.length > 0 &&
			call.selections.every((s) => s.resultPoints !== null)
				? call.selections.reduce((sum, s) => sum + (s.resultPoints ?? 0), 0)
				: null),
		// Conviction lives on the call for a numeric guess and on each
		// selection for every other shape, exactly as numericGuessPoints and
		// selectionPoints read it.
		convictions: numeric
			? call.conviction === null
				? []
				: [call.conviction]
			: call.selections.map((s) => s.conviction),
		selectionsCorrect: call.selections.map((s) => s.option?.isCorrect ?? null),
		selectionLossRates: call.selections.map((s) => s.option?.lossRate ?? null),
		createdAt: call.createdAt,
	}
}

// Always returns a card for a window that exists, even an empty one. Whether
// the window held no games, the viewer called nothing, or every call they made
// got voided, the only true sentence is the same: they have no calls that
// count for this window. There's no reason to make callers tell those apart -
// the inline card reads `settledCount + pendingCount === 0` and renders
// nothing, the permalink says so in words, and both get the window's label
// either way.
//
// The one case that IS different lives above this, in resolving the window at
// all: a key that names no window has nothing to put in that sentence, and
// that's the permalink's 404.
export async function loadReportCard(
	userId: string,
	league: League,
	window: WindowDescriptor,
): Promise<ReportCard> {
	const gameIds = await windowGameIds(league, window)
	if (gameIds.length === 0) return buildReportCard([])

	// Filtered by gameId and nothing else - no isOfficial predicate anywhere.
	// A community question on one of this window's games counts exactly like
	// an official one, which is also what Game.questionCount and
	// Game.viewerCalledCount do, so the card's totals reconcile with the "8
	// questions · 3 called" subline on the rows underneath it.
	const questions = await db.query.questions.findMany({
		where: { gameId: { in: gameIds } },
		columns: {
			id: true,
			gameId: true,
			shape: true,
			status: true,
			lossRate: true,
		},
		with: {
			calls: {
				where: { userId },
				columns: {
					id: true,
					conviction: true,
					hitTolerance: true,
					resultPoints: true,
					unscoredReason: true,
					createdAt: true,
				},
				with: {
					selections: {
						columns: { conviction: true, resultPoints: true },
						with: {
							option: { columns: { isCorrect: true, lossRate: true } },
						},
					},
				},
			},
		},
	})

	const calls = questions.flatMap((question) =>
		question.calls.map((call) => toReportCardCall(question, call)),
	)

	return buildReportCard(calls)
}

export type ReportCardResult = ReportCard & {
	league: League
	window: WindowDescriptor
	// Hydrated by loadReportCardResult - compute.ts deliberately never touches
	// the database and only knows a call's id.
	biggestHit: Call | null
	biggestMiss: Call | null
	bestGame: ReportCardGameResult | null
	worstGame: ReportCardGameResult | null
}

export type ReportCardGameResult = ReportCardGame & { game: Game }

// The card plus the rows GraphQL needs to resolve it: the league and window it
// covers, and the two highlighted calls hydrated from their ids. Kept apart
// from loadReportCard so the share card and any future non-GraphQL reader can
// take the plain aggregate without paying for the extra lookup.
export async function loadReportCardResult(
	userId: string,
	league: League,
	window: WindowDescriptor,
): Promise<ReportCardResult> {
	const card = await loadReportCard(userId, league, window)
	const ids = [card.biggestHitCallId, card.biggestMissCallId].filter(
		(id): id is string => id !== null,
	)
	const gameIds = [card.bestGame, card.worstGame].flatMap((g) =>
		g ? [g.gameId] : [],
	)
	const [highlighted, highlightedGames] = await Promise.all([
		ids.length ? db.query.calls.findMany({ where: { id: { in: ids } } }) : [],
		gameIds.length
			? db.query.games.findMany({ where: { id: { in: gameIds } } })
			: [],
	])
	const byId = new Map(highlighted.map((call) => [call.id, call]))
	const gamesById = new Map(highlightedGames.map((game) => [game.id, game]))
	const withGame = (
		row: ReportCardGame | null,
	): ReportCardGameResult | null => {
		const game = row ? gamesById.get(row.gameId) : undefined
		return row && game ? { ...row, game } : null
	}
	return {
		...card,
		league,
		window,
		biggestHit: card.biggestHitCallId
			? (byId.get(card.biggestHitCallId) ?? null)
			: null,
		biggestMiss: card.biggestMissCallId
			? (byId.get(card.biggestMissCallId) ?? null)
			: null,
		bestGame: withGame(card.bestGame),
		worstGame: withGame(card.worstGame),
	}
}
