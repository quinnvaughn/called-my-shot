import { resolutionModeFor } from "@called-my-shot/schemas"
import { inArray } from "drizzle-orm"
import { isMainModule } from "../lib/is-main-module"
import { db } from "./index"
import { questions } from "./schema"

// Sets resolution_mode on questions posted before it existed, using the same
// resolutionModeFor createQuestion uses. Open and locked questions only: a
// settled question's mode no longer changes anything. Dry run unless passed
// --commit.
export async function backfillResolutionMode({
	commit,
}: {
	commit: boolean
}): Promise<void> {
	const rows = await db.query.questions.findMany({
		where: { status: { in: ["open", "locked"] }, resolutionMode: "manual" },
		columns: {
			id: true,
			shape: true,
			customStat: true,
			statAggregation: true,
			awardName: true,
			awardVerb: true,
			picksRequired: true,
			awardConferences: true,
			awardDivisions: true,
		},
		with: {
			league: { columns: { slug: true } },
			stat: { columns: { name: true } },
		},
	})
	const systemIds = rows
		.filter(
			(q) =>
				q.league &&
				resolutionModeFor({
					...q,
					leagueSlug: q.league.slug,
					statName: q.stat?.name,
				}) === "system",
		)
		.map((q) => q.id)

	console.log(
		`[backfill-resolution-mode] ${systemIds.length} of ${rows.length} open or locked question(s) settle automatically${commit ? "" : " (dry run, pass --commit to write)"}`,
	)
	if (commit && systemIds.length > 0) {
		await db
			.update(questions)
			.set({ resolutionMode: "system" })
			.where(inArray(questions.id, systemIds))
	}
}

if (isMainModule(import.meta.url)) {
	backfillResolutionMode({ commit: process.argv.includes("--commit") })
		.then(() => process.exit(0))
		.catch((err) => {
			console.error(err)
			process.exit(1)
		})
}
