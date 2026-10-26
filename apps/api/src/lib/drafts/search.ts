import {
	and,
	asc,
	desc,
	eq,
	exists,
	ilike,
	inArray,
	isNull,
	or,
	type SQL,
	sql,
} from "drizzle-orm"
import { db } from "../../db"
import {
	draftEntries,
	leagues,
	type Prompt,
	playerFranchiseStints,
	prompts,
	teams,
} from "../../db/schema"

// The draft classes the redraft composer lists: one league's when its pills
// pick one, narrowed by its search box, newest first. The box is read word by
// word as it's typed:
//   - a number is part of a year: the years starting with it ("19" is every
//     class from the 1900s, "200" the 2000s), and for two digits the years
//     ending in it too ("03" is 2003);
//   - a league's slug or abbreviation is that league;
//   - anything left is part of a player's name, which finds the class they
//     came out of ("lebron" is the 2003 NBA Draft), best-known first.

const DEFAULT_PAGE = 12
const MAX_PAGE = 30

export async function searchDraftClasses({
	leagueId,
	query,
	first,
}: {
	leagueId?: string | null
	query?: string | null
	first?: number | null
}): Promise<Prompt[]> {
	const limit = Math.min(Math.max(first ?? DEFAULT_PAGE, 1), MAX_PAGE)
	const words = (query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean)
	const allLeagues = await db
		.select({
			id: leagues.id,
			slug: leagues.slug,
			abbreviation: leagues.abbreviation,
		})
		.from(leagues)
	const leagueIds: string[] = leagueId ? [leagueId] : []
	const yearParts: string[] = []
	const nameWords: string[] = []
	for (const word of words) {
		const league = allLeagues.find(
			(l) => l.slug === word || l.abbreviation.toLowerCase() === word,
		)
		if (league) {
			if (!leagueId) leagueIds.push(league.id)
		} else if (/^'?\d{1,4}$/.test(word)) yearParts.push(word.replace("'", ""))
		else if (word !== "draft" && word !== "redraft") nameWords.push(word)
	}
	const name = nameWords.join(" ")
	const year = sql`cast(${prompts.draftYear} as text)`
	const yearFilters = yearParts.map((part): SQL | undefined =>
		part.length === 2
			? or(sql`${year} like ${`${part}%`}`, sql`${year} like ${`%${part}`}`)
			: sql`${year} like ${`${part}%`}`,
	)

	return db
		.select({ prompt: prompts })
		.from(prompts)
		.where(
			and(
				eq(prompts.kind, "redraft"),
				isNull(prompts.removedAt),
				leagueIds.length > 0 ? inArray(prompts.leagueId, leagueIds) : undefined,
				...yearFilters,
				name
					? exists(
							db
								.select({ id: draftEntries.id })
								.from(draftEntries)
								.where(
									and(
										eq(draftEntries.leagueId, prompts.leagueId),
										eq(draftEntries.year, prompts.draftYear),
										ilike(draftEntries.playerName, `%${name}%`),
									),
								),
						)
					: undefined,
			),
		)
		.orderBy(
			...(name
				? [
						// With a name, the class of the best career that matches
						// comes first, so "lebr" leads with LeBron's 2003 class
						// rather than whichever newer class has a Lebrun in it.
						// Scores only compare within a league, so each is taken as
						// a share of its league's best.
						sql`(
							select max(${playerFranchiseStints.score}) / nullif((
								select max(best.score)
								from ${playerFranchiseStints} best
								join ${teams} on ${teams.id} = best.team_id
								where ${teams.leagueId} = ${prompts.leagueId}
							), 0)
							from ${draftEntries}
							join ${playerFranchiseStints}
								on ${playerFranchiseStints.playerId} = ${draftEntries.playerId}
							where ${draftEntries.leagueId} = ${prompts.leagueId}
								and ${draftEntries.year} = ${prompts.draftYear}
								and ${draftEntries.playerName} ilike ${`%${name}%`}
						) desc nulls last`,
					]
				: []),
			desc(prompts.draftYear),
			asc(prompts.code),
		)
		.limit(limit)
		.then((rows) => rows.map((row) => row.prompt))
}
