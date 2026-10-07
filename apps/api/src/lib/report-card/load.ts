import { isNumericGuessShape } from "@called-my-shot/scoring"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import {
	type Call,
	type Game,
	games,
	type League,
	pointAwards,
	postseasonSeries,
} from "../../db/schema"
import { type WindowDescriptor, windowGameFilter } from "../windows"
import {
	buildReportCard,
	type ReportCard,
	type ReportCardBonus,
	type ReportCardCall,
	type ReportCardGame,
	withBonuses,
} from "./compute"

// Reads the rows ./compute.ts folds: the games the window holds, the series
// those games belong to, then every call the viewer made on a question
// anchored to one of them.

async function windowGames(
	league: League,
	window: WindowDescriptor,
): Promise<{ id: string; seriesId: string | null }[]> {
	return db
		.select({ id: games.id, seriesId: games.seriesId })
		.from(games)
		.where(and(eq(games.leagueId, league.id), windowGameFilter(window)))
}

// A series question has no gameId, so it's placed by its series instead. Once
// the series is decided it belongs to the window holding the game that
// decided it, which is when it settled. Until then it's riding on every game
// of the series, so it counts as open in each window that holds one.
// settleSeries deletes the games a series never needed, so the deciding game
// is simply the series' last final game.
async function windowSeriesIds(
	inWindow: { id: string; seriesId: string | null }[],
): Promise<string[]> {
	const candidates = [
		...new Set(inWindow.flatMap((g) => (g.seriesId ? [g.seriesId] : []))),
	]
	if (candidates.length === 0) return []

	const [series, finals] = await Promise.all([
		db
			.select({
				id: postseasonSeries.id,
				winnerTeamId: postseasonSeries.winnerTeamId,
			})
			.from(postseasonSeries)
			.where(inArray(postseasonSeries.id, candidates)),
		db
			.select({
				id: games.id,
				seriesId: games.seriesId,
				startsAt: games.startsAt,
			})
			.from(games)
			.where(
				and(inArray(games.seriesId, candidates), eq(games.status, "final")),
			),
	])

	const decidingGame = new Map<string, { id: string; startsAt: Date }>()
	for (const game of finals) {
		if (!game.seriesId) continue
		const latest = decidingGame.get(game.seriesId)
		if (!latest || game.startsAt > latest.startsAt) {
			decidingGame.set(game.seriesId, game)
		}
	}

	const windowIds = new Set(inWindow.map((g) => g.id))
	return series
		.filter(
			(s) =>
				s.winnerTeamId === null ||
				windowIds.has(decidingGame.get(s.id)?.id ?? ""),
		)
		.map((s) => s.id)
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
	question: Pick<
		ReportCardCall,
		"gameId" | "shape" | "isOfficial" | "status" | "lossRate"
	>,
	call: LoadedCall,
): ReportCardCall {
	const numeric = isNumericGuessShape(question.shape)
	return {
		callId: call.id,
		gameId: question.gameId,
		shape: question.shape,
		isOfficial: question.isOfficial,
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
): Promise<ReportCard & ReportCardBonus> {
	const inWindow = await windowGames(league, window)
	if (inWindow.length === 0) return withBonuses(buildReportCard([]), [])
	const gameIds = inWindow.map((g) => g.id)
	const seriesIds = await windowSeriesIds(inWindow)

	const [questions, awards] = await Promise.all([
		windowQuestions(userId, gameIds, seriesIds),
		// An award belongs to the window holding its game. A streak that
		// started last window lands here whole if its milestone win is here.
		db
			.select({ kind: pointAwards.kind, points: pointAwards.points })
			.from(pointAwards)
			.where(
				and(
					eq(pointAwards.userId, userId),
					inArray(pointAwards.gameId, gameIds),
				),
			),
	])

	const calls = questions.flatMap((question) =>
		question.calls.map((call) => toReportCardCall(question, call)),
	)

	return withBonuses(buildReportCard(calls), awards)
}

// Filtered by gameId/seriesId and nothing else - no isOfficial predicate
// anywhere. A community question on one of this window's games counts
// exactly like an official one, which is also what Game.questionCount and
// Game.viewerCalledCount do, so the card's totals reconcile with the "8
// questions · 3 called" subline on the rows underneath it.
function windowQuestions(
	userId: string,
	gameIds: string[],
	seriesIds: string[],
) {
	return db.query.questions.findMany({
		where:
			seriesIds.length > 0
				? {
						OR: [{ gameId: { in: gameIds } }, { seriesId: { in: seriesIds } }],
					}
				: { gameId: { in: gameIds } },
		columns: {
			id: true,
			gameId: true,
			shape: true,
			isOfficial: true,
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
}

export type ReportCardResult = ReportCard &
	ReportCardBonus & {
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
