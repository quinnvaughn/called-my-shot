import { HOT_STREAK_MIN, isNumericGuessShape } from "@called-my-shot/scoring"
import { and, desc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm"
import { db } from "../../db"
import {
	callFades,
	games,
	groupRecaps,
	notifications,
	pointAwards,
} from "../../db/schema"
import { fadeWinner, loadCallSides } from "../fades"
import { loadGameVerdicts } from "../game-entry"
import { buildGroupLeaderboard, getMemberUserIds } from "../group-leaderboard"
import { getTrackedLeagueIds } from "../groups"
import { resolveSeasonIds } from "../seasons"
import { callOutcome } from "../streaks/compute"
import type { RecapCallInput, RecapInput, RecapTrackInput } from "./compute"
import type { RecapStanding } from "./types"
import type { RecapWeek } from "./week"

// Reads the rows ./compute.ts folds for one group's week. Bounded the same
// way as the group's leaderboard and highlights: its members, in the leagues
// it tracks.

type Window = { start: Date; end: Date }

const inWindow = (at: Date, week: Window) => at >= week.start && at < week.end

const sameOptions = (a: string[], b: string[]) =>
	a.length === b.length && a.every((id) => b.includes(id))

// When a call's result became real, the same reading streaks use: the game
// going final, or its start for a game that went final before finalizedAt
// was recorded. A question with no game (a season stat, an award) has
// nothing better than when it resolved.
function realizedAt(question: {
	resolvedAt: Date | null
	game: { finalizedAt: Date | null; startsAt: Date } | null
}): Date | null {
	if (question.game) return question.game.finalizedAt ?? question.game.startsAt
	return question.resolvedAt
}

export async function loadWeekCalls(
	memberIds: string[],
	tracked: string[] | null,
	week: Window,
): Promise<RecapCallInput[]> {
	const rows = await db.query.calls.findMany({
		where: {
			userId: { in: memberIds },
			unscoredReason: { isNull: true },
			question: {
				status: { in: ["resolved", "disputed"] },
				// A question resolves after its result is real, so this can only
				// drop rows the window would have dropped anyway. It keeps the read
				// from walking every member's whole history.
				resolvedAt: { gte: week.start },
				...(tracked ? { leagueId: { in: tracked } } : {}),
			},
		},
		columns: {
			id: true,
			userId: true,
			questionId: true,
			hitTolerance: true,
			resultPoints: true,
			unscoredReason: true,
			createdAt: true,
		},
		with: {
			selections: {
				columns: { optionId: true, resultPoints: true },
				with: { option: { columns: { isCorrect: true } } },
			},
			redo: {
				columns: { id: true },
				with: {
					selections: {
						columns: { optionId: true },
						with: { option: { columns: { isCorrect: true } } },
					},
				},
			},
			question: {
				columns: {
					leagueId: true,
					shape: true,
					status: true,
					locksAt: true,
					resolvedAt: true,
				},
				with: {
					game: { columns: { finalizedAt: true, startsAt: true } },
				},
			},
		},
	})

	return rows.flatMap((row) => {
		const question = row.question
		if (!question) return []
		const at = realizedAt(question)
		if (!at || !inWindow(at, week)) return []

		const outcome = callOutcome({
			shape: question.shape,
			status: question.status,
			unscoredReason: row.unscoredReason,
			hitTolerance: row.hitTolerance,
			selectionsCorrect: row.selections.map((s) => s.option?.isCorrect ?? null),
		})
		if (outcome === "skip") return []

		// calls.resultPoints is null for every option shape, which scores
		// through call_selections instead - same resolution as
		// toReportCardCall.
		const points =
			row.resultPoints ??
			(row.selections.length > 0 &&
			row.selections.every((s) => s.resultPoints !== null)
				? row.selections.reduce((sum, s) => sum + (s.resultPoints ?? 0), 0)
				: null)
		if (points === null) return []

		const numeric = isNumericGuessShape(question.shape)
		const current = row.selections.map((s) => s.optionId)
		const [only] = current
		const original = row.redo?.selections ?? []
		// A numeric redo has no option to compare, and judging whether the old
		// guess would have landed means re-running the tolerance band, so only
		// option redos count here.
		const flipped =
			!numeric &&
			original.length > 0 &&
			!sameOptions(
				original.map((s) => s.optionId),
				current,
			)

		return [
			{
				callId: row.id,
				userId: row.userId,
				questionId: row.questionId,
				leagueId: question.leagueId,
				outcome,
				points,
				optionId: !numeric && current.length === 1 && only ? only : null,
				createdAt: row.createdAt,
				locksAt: question.locksAt,
				redo: flipped
					? {
							originalWon: original.every((s) => s.option?.isCorrect === true),
						}
					: null,
			},
		]
	})
}

async function loadFadeWins(
	calls: RecapCallInput[],
	memberIds: string[],
): Promise<RecapInput["fadeWins"]> {
	if (calls.length === 0) return []
	const fades = await db
		.select({
			faderCallId: callFades.faderCallId,
			targetCallId: callFades.targetCallId,
		})
		.from(callFades)
		.where(
			inArray(
				callFades.faderCallId,
				calls.map((c) => c.callId),
			),
		)
	if (fades.length === 0) return []

	const sides = await loadCallSides(db, [
		...fades.map((f) => f.faderCallId),
		...fades.map((f) => f.targetCallId),
	])
	const members = new Set(memberIds)
	return fades.flatMap((fade) => {
		const target = sides.get(fade.targetCallId)
		if (!target || !members.has(target.userId)) return []
		return fadeWinner(sides.get(fade.faderCallId), target) === "fader"
			? [{ faderCallId: fade.faderCallId, targetUserId: target.userId }]
			: []
	})
}

// Runs that ended in the week, read off the streak_snapped notifications the
// streak rebuild already sends rather than re-walking every member's tracks.
// That inherits its rules: only runs of STREAK_NOTIFY_MIN or more, and only
// ends that were news when they happened.
async function loadSnaps(
	memberIds: string[],
	tracked: string[] | null,
	week: Window,
): Promise<RecapTrackInput[]> {
	const rows = await db
		.select({
			userId: notifications.userId,
			leagueId: notifications.leagueId,
			family: notifications.streakFamily,
			length: notifications.achievementCount,
		})
		.from(notifications)
		.where(
			and(
				eq(notifications.type, "streak_snapped"),
				inArray(notifications.userId, memberIds),
				gte(notifications.createdAt, week.start),
				lt(notifications.createdAt, week.end),
				...(tracked ? [inArray(notifications.leagueId, tracked)] : []),
			),
		)
	return rows.flatMap((row) =>
		row.leagueId && row.family && row.length !== null
			? [
					{
						userId: row.userId,
						leagueId: row.leagueId,
						family: row.family,
						length: row.length,
					},
				]
			: [],
	)
}

// Streak and sweep bonuses placed the way calls are: by when their game's
// result became real (see realizedAt). An award whose game was deleted has
// no date to place it by.
export async function loadWeekAwards(
	memberIds: string[],
	tracked: string[] | null,
	week: Window,
): Promise<RecapInput["awards"]> {
	return db
		.select({ userId: pointAwards.userId, points: pointAwards.points })
		.from(pointAwards)
		.innerJoin(games, eq(games.id, pointAwards.gameId))
		.where(
			and(
				inArray(pointAwards.userId, memberIds),
				...(tracked ? [inArray(pointAwards.leagueId, tracked)] : []),
				or(
					and(
						gte(games.finalizedAt, week.start),
						lt(games.finalizedAt, week.end),
					),
					and(
						isNull(games.finalizedAt),
						gte(games.startsAt, week.start),
						lt(games.startsAt, week.end),
					),
				),
			),
		)
}

// The board the group page shows by default: every tracked league, each
// one's current season (see groupLeaderboardScope).
async function loadStandings(
	groupId: string,
	tracked: string[] | null,
): Promise<RecapStanding[]> {
	const seasonIds = await resolveSeasonIds(
		{ scope: "CURRENT" },
		tracked?.length === 1 ? (tracked[0] ?? null) : null,
	)
	const board = await buildGroupLeaderboard(groupId, tracked, seasonIds)
	return board.flatMap((entry) =>
		entry.rank === null ? [] : [{ userId: entry.user.id, rank: entry.rank }],
	)
}

export async function loadRecapInput(
	groupId: string,
	week: RecapWeek,
): Promise<RecapInput | null> {
	const [memberIds, tracked] = await Promise.all([
		getMemberUserIds(groupId),
		getTrackedLeagueIds(groupId),
	])
	if (memberIds.length === 0) return null

	const calls = await loadWeekCalls(memberIds, tracked, week)
	const scope = {
		userId: { in: memberIds },
		...(tracked ? { leagueId: { in: tracked } } : {}),
	}
	const [
		fadeWins,
		awards,
		gameVerdicts,
		sweeps,
		snaps,
		activeStreaks,
		standings,
		previous,
	] = await Promise.all([
			loadFadeWins(calls, memberIds),
			loadWeekAwards(memberIds, tracked, week),
			loadGameVerdicts(memberIds, tracked, week),
			db.query.userSweeps.findMany({
				where: { ...scope, settledAt: { gte: week.start, lt: week.end } },
				columns: {
					userId: true,
					leagueId: true,
					slateKey: true,
					gameCount: true,
				},
			}),
			loadSnaps(memberIds, tracked, week),
			db.query.userStreaks.findMany({
				where: { ...scope, currentLength: { gte: HOT_STREAK_MIN } },
				columns: {
					userId: true,
					leagueId: true,
					family: true,
					currentLength: true,
				},
			}),
			loadStandings(groupId, tracked),
			db
				.select({ data: groupRecaps.data })
				.from(groupRecaps)
				.where(
					and(
						eq(groupRecaps.groupId, groupId),
						lt(groupRecaps.weekStart, week.start),
					),
				)
				.orderBy(desc(groupRecaps.weekStart))
				.limit(1),
		])

	return {
		calls,
		fadeWins,
		awards,
		gameVerdicts,
		sweeps,
		snaps,
		activeStreaks: activeStreaks.map((s) => ({
			userId: s.userId,
			leagueId: s.leagueId,
			family: s.family,
			length: s.currentLength,
		})),
		standings,
		previousStandings: previous[0]?.data.standings ?? null,
	}
}
