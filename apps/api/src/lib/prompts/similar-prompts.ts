import { and, count, desc, eq, ilike, isNull, type SQL } from "drizzle-orm"
import { db } from "../../db"
import { type Prompt, posts, prompts } from "../../db/schema"

// Prompts like the one someone's about to start, so they answer the one
// that's already there instead of splitting its crowd in two. Every word that
// says something has to appear in the title; the words every Rushmore title
// shares ("Rushmore", "all-time", "of") are skipped. Most-answered first,
// which is also the order the composer's prompt search lists them in.
//
// Rushmore prompts only: a draft class is found by lib/drafts/search.ts. A
// league narrows to its prompts, a team to that team's. Without either it's
// every Rushmore prompt, franchise ones included, which is what the composer's one
// search box looks through: "celtics" finds the Boston Celtics Rushmore by its
// title.

const FILLER = new Set([
	"a",
	"all",
	"all-time",
	"alltime",
	"an",
	"and",
	"for",
	"in",
	"mount",
	"mt",
	"my",
	"of",
	"the",
	"time",
	"rushmore",
	"rushmores",
])

export function significantWords(text: string): string[] {
	return [
		...new Set(
			text
				.toLowerCase()
				.split(/[^a-z0-9'-]+/)
				.map((word) => word.replace(/^['-]+|['-]+$/g, ""))
				.filter((word) => word.length > 1 && !FILLER.has(word)),
		),
	]
}

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 25

export async function searchPrompts({
	leagueId,
	teamId,
	query,
	first,
}: {
	leagueId?: string | null
	teamId?: string | null
	query?: string | null
	first?: number | null
}): Promise<Prompt[]> {
	const limit = Math.min(Math.max(first ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
	const words = significantWords(query ?? "")
	const answers = count(posts.id)
	const rows = await db
		.select({ prompt: prompts, answers })
		.from(prompts)
		.leftJoin(
			posts,
			and(
				eq(posts.promptId, prompts.id),
				isNull(posts.groupId),
				isNull(posts.removedAt),
			),
		)
		.where(
			and(
				eq(prompts.kind, "rushmore"),
				leagueId ? eq(prompts.leagueId, leagueId) : undefined,
				isNull(prompts.removedAt),
				teamId ? eq(prompts.teamId, teamId) : undefined,
				...words.map((word): SQL => ilike(prompts.title, `%${word}%`)),
			),
		)
		.groupBy(prompts.id)
		.orderBy(desc(answers), desc(prompts.createdAt))
		.limit(limit)
	return rows.map((row) => row.prompt)
}
