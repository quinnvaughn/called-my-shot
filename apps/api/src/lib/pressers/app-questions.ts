import { and, eq, inArray, isNull } from "drizzle-orm"
import { db } from "../../db"
import { type Presser, presserQuestions, pressers } from "../../db/schema"
import type { Tx } from "../../db/types"
import { APP_QUESTION_COUNT, SORT_RANK } from "./constants"
import { loadPresserFacts } from "./facts"
import { pickAppQuestions } from "./templates"

export function isPresserOpen(
	presser: Pick<Presser, "closesAt">,
	now = new Date(),
): boolean {
	return now < presser.closesAt
}

// Brings a presser's app questions in line with the owner's results as they
// stand now: a pending one whose fact no longer holds is withdrawn, and while
// the presser is open, new ones fill it back up to APP_QUESTION_COUNT.
// Answered ones never move - they're the record.
async function syncAppQuestions(
	tx: Tx,
	presser: Presser,
	now: Date,
): Promise<void> {
	const facts = await loadPresserFacts(tx, presser.userId, presser.gameId)
	const drafts = facts ? pickAppQuestions(facts) : []
	const wanted = new Set(drafts.map((draft) => draft.appKey))

	const existing = await tx
		.select({
			id: presserQuestions.id,
			appKey: presserQuestions.appKey,
			status: presserQuestions.status,
		})
		.from(presserQuestions)
		.where(
			and(
				eq(presserQuestions.presserId, presser.id),
				eq(presserQuestions.source, "app"),
			),
		)
	const stale = existing.filter(
		(row) => row.status === "pending" && !wanted.has(row.appKey ?? ""),
	)
	if (stale.length > 0) {
		await tx
			.update(presserQuestions)
			.set({ status: "withdrawn" })
			.where(
				inArray(
					presserQuestions.id,
					stale.map((row) => row.id),
				),
			)
	}
	if (!isPresserOpen(presser, now)) return

	const staleIds = new Set(stale.map((row) => row.id))
	const live = existing.filter(
		(row) =>
			(row.status === "pending" || row.status === "answered") &&
			!staleIds.has(row.id),
	)
	const known = new Set(existing.map((row) => row.appKey))
	const room = APP_QUESTION_COUNT - live.length
	const fresh = drafts
		.filter((draft) => !known.has(draft.appKey))
		.slice(0, room)
	if (fresh.length === 0) return
	await tx
		.insert(presserQuestions)
		.values(
			fresh.map((draft) => ({
				presserId: presser.id,
				source: "app" as const,
				appTemplate: draft.template,
				callId: draft.callId,
				appKey: draft.appKey,
				body: draft.body,
				sortRank: SORT_RANK.app,
				createdAt: now,
			})),
		)
		.onConflictDoNothing()
}

// Writes a presser's app questions the first time its owner opens it, so an
// owner who never looks never costs the queries behind them. A closed presser
// gets none: nobody can answer them anymore.
export async function ensureAppQuestions(
	presser: Presser,
	now = new Date(),
): Promise<void> {
	if (presser.appQuestionsGeneratedAt || !isPresserOpen(presser, now)) return
	await db.transaction(async (tx) => {
		// Locked, and re-read under the lock, so two loads of the page at once
		// generate once.
		const [locked] = await tx
			.select()
			.from(pressers)
			.where(
				and(
					eq(pressers.id, presser.id),
					isNull(pressers.appQuestionsGeneratedAt),
				),
			)
			.for("update")
		if (!locked) return
		await syncAppQuestions(tx, locked, now)
		await tx
			.update(pressers)
			.set({ appQuestionsGeneratedAt: now })
			.where(eq(pressers.id, locked.id))
	})
}

// After a result on the game moved (a dispute overturned, a re-resolve, a
// void). Only for a presser whose app questions were already written; one
// still waiting on its owner's first visit builds them from the new results
// then anyway.
export async function refreshAppQuestions(
	tx: Tx,
	presser: Presser,
	now = new Date(),
): Promise<void> {
	if (!presser.appQuestionsGeneratedAt) return
	await syncAppQuestions(tx, presser, now)
}
