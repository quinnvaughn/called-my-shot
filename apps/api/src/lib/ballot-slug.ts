import { like, or, sql } from "drizzle-orm"
import { db } from "../db"
import { ballots } from "../db/schema"

// Lowercase, alphanumerics only, single dashes between runs, no leading or
// trailing dash. Season display names ("2025-26") keep their internal dash
// because it's already the separator this produces.
function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
}

// A ballot's url. Built from the league and season rather than the name
// alone because only auto-generated names carry the season already
// (season-questions.ts composes `${season.displayName} ${group}`) - a
// hand-made "Week 1" would otherwise collide with next season's.
// The season prefix is stripped off the name first so the auto-generated
// ones don't come out "mlb-2026-2026-al-gold-gloves".
export function buildBallotSlug(params: {
	leagueSlug: string
	seasonDisplayName: string
	name: string
}): string {
	const name = slugify(params.name)
	const season = slugify(params.seasonDisplayName)
	const withoutSeason = name.startsWith(`${season}-`)
		? name.slice(season.length + 1)
		: name
	return [slugify(params.leagueSlug), season, withoutSeason]
		.filter((part) => part.length > 0)
		.join("-")
}

// Appends -2, -3, ... to the base slug until it's free. Ballot names carry
// no uniqueness constraint of their own (createBallot doesn't check one, and
// findOrCreateBallot's (league, season, name) lookup isn't enforced in the
// db), so two ballots really can want the same slug.
export async function generateUniqueBallotSlug(params: {
	leagueSlug: string
	seasonDisplayName: string
	name: string
}): Promise<string> {
	const base = buildBallotSlug(params)
	const taken = await db
		.select({ slug: ballots.slug })
		.from(ballots)
		.where(or(sql`${ballots.slug} = ${base}`, like(ballots.slug, `${base}-%`)))
	const used = new Set(taken.map((row) => row.slug))
	if (!used.has(base)) return base
	let suffix = 2
	while (used.has(`${base}-${suffix}`)) suffix++
	return `${base}-${suffix}`
}
