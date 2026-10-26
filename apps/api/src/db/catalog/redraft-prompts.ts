import { eq, sql } from "drizzle-orm"
import { db } from "../index"
import { draftEntries, leagues, prompts } from "../schema"

// The app's own redraft prompt for every draft class in draft_entries:
// "2003 NBA Draft" at /redraft/nba-2003. Upserted on the class, so a league
// whose slug or abbreviation changes renames its prompts and every answer
// stays with them. A prompt an admin took down stays down.
//
// Idempotent, so it runs at every release (see ./run.ts) as well as at the
// end of drafts:ingest, which is what adds a new class.
export const redraftCode = (leagueSlug: string, year: number) =>
	`${leagueSlug}-${year}`

export const redraftTitle = (leagueAbbreviation: string, year: number) =>
	`${year} ${leagueAbbreviation} Draft`

export async function syncRedraftPromptCatalog(): Promise<number> {
	const classes = await db
		.selectDistinct({
			leagueId: draftEntries.leagueId,
			year: draftEntries.year,
			slug: leagues.slug,
			abbreviation: leagues.abbreviation,
		})
		.from(draftEntries)
		.innerJoin(leagues, eq(leagues.id, draftEntries.leagueId))
		.where(
			sql`${draftEntries.overall} is not null and ${leagues.status} = 'active'`,
		)

	for (const draftClass of classes) {
		const values = {
			kind: "redraft" as const,
			code: redraftCode(draftClass.slug, draftClass.year),
			title: redraftTitle(draftClass.abbreviation, draftClass.year),
			leagueId: draftClass.leagueId,
			draftYear: draftClass.year,
		}
		await db
			.insert(prompts)
			.values({ ...values, creatorId: null })
			.onConflictDoUpdate({
				target: [prompts.kind, prompts.leagueId, prompts.draftYear],
				targetWhere: sql`${prompts.creatorId} is null and ${prompts.draftYear} is not null`,
				set: { code: values.code, title: values.title },
			})
	}
	return classes.length
}
