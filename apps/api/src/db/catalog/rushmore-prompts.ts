import { sql } from "drizzle-orm"
import { promptSlug } from "../../lib/prompts/slug"
import { db } from "../index"
import { prompts } from "../schema"

// The app's own Rushmore prompt for every franchise in a league the app
// syncs: titled just "Boston Celtics" (see lib/prompts/subject.ts), at
// /rushmore/boston-celtics. Upserted on the team, so a
// rebrand or a new abbreviation renames the prompt and moves its code, and
// every answer stays with it. A prompt an admin took down stays down.
//
// Idempotent, so it runs at every release (see ./run.ts). A league switched
// on later gets its prompts the first release after its teams land.
export async function syncRushmorePromptCatalog(): Promise<number> {
	const rows = await db.query.teams.findMany({
		columns: { id: true, name: true, abbreviation: true, leagueId: true },
		with: { league: { columns: { slug: true, status: true } } },
	})

	let synced = 0
	for (const team of rows) {
		if (team.league?.status !== "active") continue
		const values = {
			kind: "rushmore" as const,
			code: promptSlug(team.name),
			title: team.name,
			leagueId: team.leagueId,
			teamId: team.id,
		}
		await db
			.insert(prompts)
			.values({ ...values, creatorId: null })
			.onConflictDoUpdate({
				target: [prompts.kind, prompts.teamId],
				targetWhere: sql`${prompts.creatorId} is null and ${prompts.teamId} is not null`,
				set: {
					code: values.code,
					title: values.title,
					leagueId: values.leagueId,
				},
			})
		synced++
	}
	return synced
}
