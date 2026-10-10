import { isDeepStrictEqual } from "node:util"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { type GroupRecap, groupRecaps } from "../../db/schema"
import { GENERATE_GROUP_RECAPS_LOCK } from "../job-lock"
import { runCli } from "../run-cli"
import { DAY_MS } from "../time"
import { randomToken } from "../tokens"
import { computeRecap } from "./compute"
import { loadRecapInput } from "./load"
import { lastCompletedWeek, type RecapWeek } from "./week"

// How long after its week ends a recap still follows the results under it.
// Long enough for a dispute filed on the weekend to be decided, short enough
// that a link people have already seen doesn't keep changing.
export const RECAP_REVISE_DAYS = 3

// Makes one group's recap for a week, unless it has one or the week didn't
// clear RECAP_MIN_ACTIVE_MEMBERS. Returns the row it made.
export async function ensureGroupRecap(
	groupId: string,
	week: RecapWeek,
): Promise<GroupRecap | null> {
	const existing = await db.query.groupRecaps.findFirst({
		where: { groupId, weekKey: week.key },
		columns: { id: true },
	})
	if (existing) return null

	const input = await loadRecapInput(groupId, week)
	const data = input ? computeRecap(input) : null
	if (!data) return null

	const [row] = await db
		.insert(groupRecaps)
		.values({
			groupId,
			weekKey: week.key,
			weekStart: week.start,
			weekEnd: week.end,
			data,
			shareToken: randomToken(),
		})
		.onConflictDoNothing()
		.returning()
	return row ?? null
}

// Re-reads a recap's week and rewrites it if a result under it moved. The
// standings and movers stay as they were: they describe the board when the
// recap was made, and re-reading the board now would pull in results from
// after the week. A week that no longer qualifies keeps the recap it has
// rather than taking down a link that's already been shared.
export async function reviseGroupRecap(recap: GroupRecap): Promise<boolean> {
	const input = await loadRecapInput(recap.groupId, {
		key: recap.weekKey,
		start: recap.weekStart,
		end: recap.weekEnd,
	})
	const computed = input ? computeRecap(input) : null
	if (!computed) return false

	const next = {
		...computed,
		standings: recap.data.standings,
		movers: recap.data.movers,
	}
	// jsonb hands objects back with their keys reordered, which a deep
	// comparison ignores and a string comparison wouldn't.
	if (isDeepStrictEqual(next, recap.data)) return false

	await db
		.update(groupRecaps)
		.set({ data: next, version: recap.version + 1, updatedAt: new Date() })
		.where(eq(groupRecaps.id, recap.id))
	return true
}

// The daily pass: last week's recap for every group that doesn't have one,
// then revisions for the ones still inside RECAP_REVISE_DAYS. Runs every day
// rather than only on Tuesday, so a missed run catches up on the next.
export async function generateGroupRecaps(
	now = new Date(),
): Promise<{ created: number; revised: number }> {
	const week = lastCompletedWeek(now)
	const groups = await db.query.groups.findMany({ columns: { id: true } })

	const made = new Set<string>()
	for (const group of groups) {
		const row = await ensureGroupRecap(group.id, week)
		if (row) made.add(row.id)
	}

	const recent = await db.query.groupRecaps.findMany({
		where: {
			weekEnd: { gt: new Date(now.getTime() - RECAP_REVISE_DAYS * DAY_MS) },
		},
	})
	let revised = 0
	for (const recap of recent) {
		if (made.has(recap.id)) continue
		if (await reviseGroupRecap(recap)) revised++
	}

	console.log(
		`[group-recaps] ${week.key}: ${made.size} created, ${revised} revised`,
	)
	return { created: made.size, revised }
}

// `pnpm --filter api recaps:generate [date]`. A date makes the run behave as
// if it were that moment, so a past week can be recapped by hand.
runCli(
	import.meta.url,
	() => {
		const at = process.argv[2]
		return generateGroupRecaps(at ? new Date(at) : new Date())
	},
	{ lock: GENERATE_GROUP_RECAPS_LOCK },
)
