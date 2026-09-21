import {
	STREAK_FAMILY_LABEL,
	STREAK_FLAIR_THRESHOLDS,
	type StreakFamily,
	shapesInFamily,
} from "@called-my-shot/scoring"
import { and, eq } from "drizzle-orm"
import { match } from "ts-pattern"
import { callStreakPositions, userStreaks, userSweeps } from "../../db/schema"
import type { Tx } from "../../db/types"
import { grantFlairByKey } from "../flairs/grant"
import {
	callOutcome,
	canonicalWinnerQuestion,
	computeSlateSweeps,
	computeTrack,
	isFresh,
	type Outcome,
	type SlateQuestion,
	streakEvents,
	type TrackRow,
} from "./compute"
import { announceOnce, noticeKey } from "./notices"
import {
	formatSlateLabel,
	type ParsedSlateKey,
	parseSlateKey,
	slateDayRange,
} from "./slate"

export type RecomputeOptions = {
	// Off for the backfill, which rebuilds history nobody should be told about.
	notify: boolean
	now: Date
}

type LoadedSelection = { option: { isCorrect: boolean | null } | null }

const selectionsCorrect = (selections: LoadedSelection[]) =>
	selections.map((s) => s.option?.isCorrect ?? null)

// Rebuilds one (user, league, family) track from that user's calls: every
// call's run position, the current and best runs, and - when notify is on -
// whatever the rebuild changed that's worth announcing.
export async function recomputeStreakTrack(
	tx: Tx,
	userId: string,
	leagueId: string,
	family: StreakFamily,
	opts: RecomputeOptions,
): Promise<void> {
	const league = await tx.query.leagues.findFirst({
		where: { id: leagueId },
		columns: { abbreviation: true },
	})
	if (!league) return

	const prev = await tx.query.userStreaks.findFirst({
		where: { userId, leagueId, family },
	})

	const callRows = await tx.query.calls.findMany({
		where: {
			userId,
			question: {
				leagueId,
				shape: { in: shapesInFamily(family) },
				resolutionMode: "system",
				gameId: { isNotNull: true },
				status: { in: ["resolved", "disputed"] },
			},
		},
		columns: {
			id: true,
			questionId: true,
			unscoredReason: true,
			hitTolerance: true,
		},
		with: {
			selections: {
				columns: { id: true },
				with: { option: { columns: { isCorrect: true } } },
			},
			question: {
				columns: { shape: true, status: true },
				with: { game: { columns: { startsAt: true, finalizedAt: true } } },
			},
		},
	})

	const rows: TrackRow[] = callRows.flatMap((call) => {
		const game = call.question?.game
		if (!call.question || !game) return []
		return [
			{
				callId: call.id,
				questionId: call.questionId,
				outcome: callOutcome({
					shape: call.question.shape,
					status: call.question.status,
					unscoredReason: call.unscoredReason,
					hitTolerance: call.hitTolerance,
					selectionsCorrect: selectionsCorrect(call.selections),
				}),
				realizedAt: game.finalizedAt ?? game.startsAt,
				startsAt: game.startsAt,
			},
		]
	})
	const track = computeTrack(rows)

	const isTrack = (table: typeof callStreakPositions | typeof userStreaks) =>
		and(
			eq(table.userId, userId),
			eq(table.leagueId, leagueId),
			eq(table.family, family),
		)

	await tx.delete(callStreakPositions).where(isTrack(callStreakPositions))
	if (track.positions.size > 0) {
		await tx.insert(callStreakPositions).values(
			[...track.positions].map(([callId, length]) => ({
				callId,
				userId,
				leagueId,
				family,
				length,
			})),
		)
	}

	if (track.lastSettledAt === null) {
		await tx.delete(userStreaks).where(isTrack(userStreaks))
	} else {
		const values = {
			currentLength: track.current?.length ?? 0,
			currentStartCallId: track.current?.startCallId ?? null,
			currentEndCallId: track.current?.endCallId ?? null,
			bestLength: track.best?.length ?? 0,
			bestStartCallId: track.best?.startCallId ?? null,
			bestEndCallId: track.best?.endCallId ?? null,
			bestEndedAt: track.best?.endedAt ?? null,
			currentColdLength: track.currentCold?.length ?? 0,
			currentColdStartCallId: track.currentCold?.startCallId ?? null,
			currentColdEndCallId: track.currentCold?.endCallId ?? null,
			worstColdLength: track.worstCold?.length ?? 0,
			worstColdStartCallId: track.worstCold?.startCallId ?? null,
			worstColdEndCallId: track.worstCold?.endCallId ?? null,
			worstColdEndedAt: track.worstCold?.endedAt ?? null,
			lastSettledAt: track.lastSettledAt,
			computedAt: opts.now,
		}
		await tx
			.insert(userStreaks)
			.values({ userId, leagueId, family, ...values })
			.onConflictDoUpdate({
				target: [userStreaks.userId, userStreaks.leagueId, userStreaks.family],
				set: values,
			})
	}

	// Above the notify guard on purpose. A grant is state, not an
	// announcement, so the backfill (which runs with notify off) still awards
	// runs that happened before flairs existed.
	//
	// Read off the rebuilt track's best run rather than the event stream below,
	// so a rebuild that re-derives the same run grants the same flair without
	// depending on having seen its milestone event on this particular pass.
	for (const threshold of STREAK_FLAIR_THRESHOLDS) {
		if ((track.best?.length ?? 0) >= threshold) {
			await grantFlairByKey(tx, userId, `streak:${threshold}`)
		}
	}

	if (!opts.notify) return
	const achievementLabel = `${league.abbreviation} ${STREAK_FAMILY_LABEL[family]}`
	const base = { userId, leagueId, streakFamily: family, achievementLabel }
	for (const event of streakEvents(prev ?? null, track, opts.now)) {
		await match(event)
			.with({ kind: "streak_milestone" }, (e) =>
				announceOnce(
					tx,
					noticeKey.milestone(leagueId, family, e.runStartCallId, e.milestone),
					{ ...base, type: "streak_milestone", achievementCount: e.length },
				),
			)
			.with({ kind: "streak_personal_best" }, (e) =>
				announceOnce(
					tx,
					noticeKey.personalBest(leagueId, family, e.runStartCallId),
					{
						...base,
						type: "streak_personal_best",
						achievementCount: e.length,
						previousBest: e.previousBest,
					},
				),
			)
			.with({ kind: "streak_snapped" }, (e) =>
				announceOnce(
					tx,
					noticeKey.snapped(leagueId, family, e.runStartCallId),
					{
						...base,
						type: "streak_snapped",
						achievementCount: e.length,
					},
				),
			)
			.exhaustive()
	}
}

// Rebuilds who swept one slate: every game's canonical winner question, and
// the users who called all of them right once none are still waiting.
export async function recomputeSlate(
	tx: Tx,
	leagueId: string,
	slateKey: string,
	opts: RecomputeOptions,
): Promise<void> {
	const isSlate = and(
		eq(userSweeps.leagueId, leagueId),
		eq(userSweeps.slateKey, slateKey),
	)
	const previous = await tx
		.select({ userId: userSweeps.userId })
		.from(userSweeps)
		.where(isSlate)
	await tx.delete(userSweeps).where(isSlate)

	const league = await tx.query.leagues.findFirst({
		where: { id: leagueId },
		columns: { slug: true, abbreviation: true },
	})
	const slate = parseSlateKey(slateKey)
	if (!league || !slate) return

	const slateGames = await loadSlateGames(tx, leagueId, slate)
	const slateQuestions: SlateQuestion[] = []
	const outcomesByUser = new Map<string, Map<string, Outcome>>()

	for (const game of slateGames) {
		const question = canonicalWinnerQuestion(
			league.slug,
			game.id,
			game.questions,
		)
		if (!question) continue
		slateQuestions.push({
			questionId: question.id,
			status: question.status,
			startsAt: game.startsAt,
			realizedAt: game.finalizedAt ?? game.startsAt,
		})
		for (const call of question.calls) {
			const outcomes =
				outcomesByUser.get(call.userId) ?? new Map<string, Outcome>()
			outcomes.set(
				question.id,
				callOutcome({
					shape: "team_vs_team",
					status: question.status,
					unscoredReason: call.unscoredReason,
					hitTolerance: call.hitTolerance,
					selectionsCorrect: selectionsCorrect(call.selections),
				}),
			)
			outcomesByUser.set(call.userId, outcomes)
		}
	}

	const result = computeSlateSweeps(slateQuestions, outcomesByUser)
	const seasonId = slateGames[0]?.seasonId
	const { firstStartsAt, settledAt } = result
	if (
		result.sweptUserIds.length === 0 ||
		!seasonId ||
		!firstStartsAt ||
		!settledAt
	) {
		return
	}

	await tx.insert(userSweeps).values(
		result.sweptUserIds.map((userId) => ({
			userId,
			leagueId,
			slateKey,
			seasonId,
			gameCount: result.gameCount,
			firstStartsAt,
			settledAt,
			computedAt: opts.now,
		})),
	)

	// Above the notify and freshness guards, same reasoning as the streak
	// grant in recomputeStreakTrack: the flair is earned by the sweep itself,
	// not by the announcement being fresh enough to send.
	for (const userId of result.sweptUserIds) {
		await grantFlairByKey(tx, userId, "sweep:first")
	}

	if (!opts.notify || !isFresh(settledAt, opts.now)) return
	const alreadySwept = new Set(previous.map((row) => row.userId))
	const achievementLabel = `${league.abbreviation} ${formatSlateLabel(slate, league.slug)}`
	for (const userId of result.sweptUserIds) {
		if (alreadySwept.has(userId)) continue
		await announceOnce(tx, noticeKey.sweep(leagueId, slateKey), {
			type: "sweep_completed",
			userId,
			leagueId,
			slateKey,
			achievementLabel,
			achievementCount: result.gameCount,
		})
	}
}

// Every game in the slate with its who-wins questions and the calls on them.
export function loadSlateGames(
	tx: Pick<Tx, "query">,
	leagueId: string,
	slate: ParsedSlateKey,
) {
	const where = match(slate)
		.with({ kind: "day" }, ({ day }) => {
			const { start, end } = slateDayRange(day)
			return { leagueId, startsAt: { gte: start, lt: end } }
		})
		.with({ kind: "week_slot" }, (s) => ({
			leagueId,
			seasonType: s.seasonType,
			weekNumber: s.weekNumber,
			slot: s.slot,
			season: { year: s.seasonYear },
		}))
		.with({ kind: "week_day" }, (s) => {
			const { start, end } = slateDayRange(s.day)
			return {
				leagueId,
				seasonType: s.seasonType,
				weekNumber: s.weekNumber,
				slot: { isNull: true as const },
				startsAt: { gte: start, lt: end },
				season: { year: s.seasonYear },
			}
		})
		.exhaustive()

	return tx.query.games.findMany({
		where,
		orderBy: { startsAt: "asc" },
		columns: {
			id: true,
			seasonId: true,
			startsAt: true,
			finalizedAt: true,
			homeTeamId: true,
			awayTeamId: true,
		},
		with: {
			questions: {
				where: { shape: "team_vs_team" },
				columns: {
					id: true,
					generationKey: true,
					isOfficial: true,
					resolutionMode: true,
					createdAt: true,
					status: true,
				},
				with: {
					calls: {
						columns: {
							id: true,
							userId: true,
							unscoredReason: true,
							hitTolerance: true,
						},
						with: {
							selections: {
								columns: { id: true },
								with: {
									option: { columns: { isCorrect: true, teamId: true } },
								},
							},
						},
					},
				},
			},
		},
	})
}
