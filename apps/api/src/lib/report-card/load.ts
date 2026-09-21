import { isNumericGuessShape } from "@called-my-shot/scoring"
import { and, eq } from "drizzle-orm"
import { db } from "../../db"
import { games, type League } from "../../db/schema"
import type { ReportCardResult } from "../../graphql/types/sports/report-card"
import {
	type WindowDescriptor,
	windowGameFilter,
} from "../../graphql/types/sports/windows"
import {
	buildReportCard,
	type ReportCard,
	type ReportCardCall,
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
		columns: { id: true, shape: true, status: true, lossRate: true },
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
						with: { option: { columns: { isCorrect: true } } },
					},
				},
			},
		},
	})

	const calls = questions.flatMap((question): ReportCardCall[] =>
		question.calls.map((call) => {
			const numeric = isNumericGuessShape(question.shape)
			return {
				callId: call.id,
				shape: question.shape,
				status: question.status,
				unscoredReason: call.unscoredReason,
				hitTolerance: call.hitTolerance,
				lossRate: question.lossRate,
				// The trap this whole module exists around: calls.resultPoints is
				// null for every option shape, which scores through
				// call_selections instead (see the comment on `calls` in
				// db/schema/calls.ts). Reading the call column alone reports a
				// near-zero net for almost every caller, silently. Same resolution
				// CallRef.totalPoints already uses.
				netPoints:
					call.resultPoints ??
					(call.selections.length > 0 &&
					call.selections.every((s) => s.resultPoints !== null)
						? call.selections.reduce((sum, s) => sum + (s.resultPoints ?? 0), 0)
						: null),
				// Conviction lives on the call for a numeric guess and on each
				// selection for every other shape, exactly as numericGuessPoints
				// and selectionPoints read it.
				convictions: numeric
					? call.conviction === null
						? []
						: [call.conviction]
					: call.selections.map((s) => s.conviction),
				selectionsCorrect: call.selections.map(
					(s) => s.option?.isCorrect ?? null,
				),
				createdAt: call.createdAt,
			}
		}),
	)

	return buildReportCard(calls)
}

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
	const highlighted = ids.length
		? await db.query.calls.findMany({ where: { id: { in: ids } } })
		: []
	const byId = new Map(highlighted.map((call) => [call.id, call]))
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
	}
}
