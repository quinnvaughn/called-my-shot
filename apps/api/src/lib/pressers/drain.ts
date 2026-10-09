import { and, asc, count, eq } from "drizzle-orm"
import { db } from "../../db"
import {
	calls,
	games,
	groupMembers,
	presserOpenQueue,
	pressers,
	questions,
} from "../../db/schema"
import type { Tx } from "../../db/types"
import {
	enqueueAnalyticsEvents,
	type ServerAnalyticsEvent,
} from "../analytics-outbox"
import { createNotification } from "../notifications"
import { HOUR_MS } from "../time"
import { refreshAppQuestions } from "./app-questions"
import { PRESSER_WINDOW_HOURS } from "./constants"
import { presserEligible } from "./facts"

const BATCH_SIZE = 200
const MAX_PER_RUN = 5000

async function openedEvent(
	tx: Tx,
	presserId: string,
	userId: string,
	gameId: string,
): Promise<ServerAnalyticsEvent> {
	const [[game], [called], [membership]] = await Promise.all([
		tx
			.select({ leagueId: games.leagueId })
			.from(games)
			.where(eq(games.id, gameId)),
		tx
			.select({ n: count() })
			.from(calls)
			.innerJoin(questions, eq(questions.id, calls.questionId))
			.where(and(eq(calls.userId, userId), eq(questions.gameId, gameId))),
		tx
			.select({ groupId: groupMembers.groupId })
			.from(groupMembers)
			.where(eq(groupMembers.userId, userId))
			.limit(1),
	])
	return {
		event: "presser_opened",
		userId,
		properties: {
			presserId,
			gameId,
			leagueId: game?.leagueId ?? "",
			callCount: called?.n ?? 0,
			ownerInAGroup: membership !== undefined,
		},
	}
}

type DrainOutcome = "opened" | "refreshed" | "waiting" | "skipped"

// Works off presser_open_queue: opens each due presser, and re-checks the
// app questions on one that's already open. Each row is its own short
// transaction, deleted in it only if its dirtiedAt is still the one this run
// read - the same discipline as drainAchievementRecomputes.
//
// A row whose game isn't final yet stays queued: a call can settle before its
// game ends (an admin resolving early), and nothing else would mark it again
// once the game does.
//
// MUST be called under PRESSER_OPEN_LOCK (lib/job-lock.ts).
export async function drainPresserOpens({
	now = new Date(),
}: {
	now?: Date
} = {}): Promise<{ opened: number; refreshed: number }> {
	const seen = new Set<string>()
	let opened = 0
	let refreshed = 0
	let handled = 0
	while (handled < MAX_PER_RUN) {
		const batch = await db
			.select()
			.from(presserOpenQueue)
			.orderBy(asc(presserOpenQueue.dirtiedAt))
			.limit(BATCH_SIZE)
		const key = (row: (typeof batch)[number]) =>
			`${row.userId}:${row.gameId}:${row.dirtiedAt.getTime()}`
		const fresh = batch.filter((row) => !seen.has(key(row)))
		if (fresh.length === 0) break
		for (const row of fresh) {
			seen.add(key(row))
			const outcome = await db.transaction(
				async (tx): Promise<DrainOutcome> => {
					const game = await tx.query.games.findFirst({
						where: { id: row.gameId },
						columns: { status: true },
					})
					const existing = await tx.query.pressers.findFirst({
						where: { userId: row.userId, gameId: row.gameId },
					})
					let result: DrainOutcome = "skipped"
					if (existing) {
						await refreshAppQuestions(tx, existing, now)
						result = "refreshed"
					} else if (game?.status !== "final") {
						return "waiting"
					} else if (await presserEligible(tx, row.userId, row.gameId)) {
						const [inserted] = await tx
							.insert(pressers)
							.values({
								userId: row.userId,
								gameId: row.gameId,
								openedAt: now,
								closesAt: new Date(
									now.getTime() + PRESSER_WINDOW_HOURS * HOUR_MS,
								),
							})
							.onConflictDoNothing()
							.returning({ id: pressers.id })
						if (inserted) {
							await enqueueAnalyticsEvents(tx, [
								await openedEvent(tx, inserted.id, row.userId, row.gameId),
							])
							// Marks the owner's game notification unread again, now
							// that it can say their presser is open.
							await createNotification(tx, {
								type: "game_resolved",
								userId: row.userId,
								gameId: row.gameId,
							})
							result = "opened"
						}
					}
					await tx
						.delete(presserOpenQueue)
						.where(
							and(
								eq(presserOpenQueue.userId, row.userId),
								eq(presserOpenQueue.gameId, row.gameId),
								eq(presserOpenQueue.dirtiedAt, row.dirtiedAt),
							),
						)
					return result
				},
			)
			if (outcome === "opened") opened++
			if (outcome === "refreshed") refreshed++
			handled++
		}
	}
	if (opened > 0 || refreshed > 0) {
		console.log(`[pressers] opened=${opened} refreshed=${refreshed}`)
	}
	return { opened, refreshed }
}
