import { type RedraftLength, redraftLengths } from "@called-my-shot/schemas"
import { and, asc, count, eq, inArray, isNotNull } from "drizzle-orm"
import { db } from "../../db"
import { type DraftEntry, draftEntries, type Prompt } from "../../db/schema"
import type { DbOrTx } from "../../db/types"

// A draft class as a redraft sees it. Its slots are the class's picks in
// order: slot 1 is the first pick, whoever held it. A pick the league voided
// leaves no slot, so slots run 1, 2, 3... even where pick numbers skip.

export type DraftClassPrompt = Pick<Prompt, "leagueId" | "draftYear">

export type DraftSlot = DraftEntry & { slot: number }

function classOf(prompt: DraftClassPrompt) {
	if (!prompt.leagueId || prompt.draftYear === null) {
		throw new Error("Not a draft class prompt")
	}
	return { leagueId: prompt.leagueId, year: prompt.draftYear }
}

// The first `limit` slots of the class.
export async function draftSlots(
	prompt: DraftClassPrompt,
	limit: number,
	q: DbOrTx = db,
): Promise<DraftSlot[]> {
	const { leagueId, year } = classOf(prompt)
	const rows = await q
		.select()
		.from(draftEntries)
		.where(
			and(
				eq(draftEntries.leagueId, leagueId),
				eq(draftEntries.year, year),
				isNotNull(draftEntries.overall),
			),
		)
		.orderBy(asc(draftEntries.overall))
		.limit(limit)
	return rows.map((row, i) => ({ ...row, slot: i + 1 }))
}

export async function firstRoundSize(
	prompt: DraftClassPrompt,
	q: DbOrTx = db,
): Promise<number> {
	const { leagueId, year } = classOf(prompt)
	const [row] = await q
		.select({ n: count() })
		.from(draftEntries)
		.where(
			and(
				eq(draftEntries.leagueId, leagueId),
				eq(draftEntries.year, year),
				eq(draftEntries.round, 1),
			),
		)
	return row?.n ?? 0
}

// The lengths this class can be redrafted at (see redraftLengths).
export async function classLengths(
	prompt: DraftClassPrompt,
	q: DbOrTx = db,
): Promise<RedraftLength[]> {
	const { leagueId, year } = classOf(prompt)
	const league = await q.query.leagues.findFirst({
		where: { id: leagueId },
		columns: { slug: true },
	})
	return redraftLengths(
		league?.slug ?? "",
		year,
		await firstRoundSize(prompt, q),
	)
}

// Where each of these players went in his class: the pick number, or null
// for one who came in undrafted.
export async function originalPicks(
	q: DbOrTx,
	leagueId: string,
	playerIds: string[],
): Promise<Map<string, number | null>> {
	if (playerIds.length === 0) return new Map()
	const rows = await q
		.select({ playerId: draftEntries.playerId, overall: draftEntries.overall })
		.from(draftEntries)
		.where(
			and(
				eq(draftEntries.leagueId, leagueId),
				inArray(draftEntries.playerId, playerIds),
			),
		)
	return new Map(
		rows.flatMap((row) => (row.playerId ? [[row.playerId, row.overall]] : [])),
	)
}
