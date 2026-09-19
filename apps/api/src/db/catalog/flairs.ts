import { STREAK_FLAIR_THRESHOLDS } from "@called-my-shot/scoring"
import { db } from "../index"
import { flairs } from "../schema"

type AchievementFlair = {
	key: string
	icon: string
	label: string
	description: string
	color: string
	sortOrder: number
}

// The flairs that aren't a team. Upserted by `key`, so editing a label or a
// color here updates the live row on the next sync instead of erroring on the
// unique index - the same contract TOLERANCE_TIERS in ./stats.ts has.
//
// Renaming a `key`, though, makes the sync create a second flair beside the
// first and orphan every grant pointing at the old one. Same trap as a
// GAME_QUESTION_CATALOG template id.
//
// Deliberately short. Every entry is something a person wears INSTEAD of the
// team they picked, so the bar is "worth giving up your team slot for", and
// that bar is easier to hold with four entries than with forty. The streak
// ones are generated from STREAK_FLAIR_THRESHOLDS so the numbers that decide
// who earns what live in one place, next to the rest of the streak math.
const STREAK_FLAIRS: AchievementFlair[] = STREAK_FLAIR_THRESHOLDS.map(
	(length) => ({
		key: `streak:${length}`,
		icon: `${length}x`,
		label: `${length} in a row`,
		description: `${length} straight correct calls in one league and family.`,
		// The same green a correct call already gets, so a streak flair reads
		// as a win without anyone having to learn a new color.
		color: "#22C55E",
		sortOrder: length,
	}),
)

export const ACHIEVEMENT_FLAIRS: AchievementFlair[] = [
	...STREAK_FLAIRS,
	{
		key: "sweep:first",
		icon: "SWP",
		label: "Slate sweep",
		description: "Called every winner in a full slate.",
		color: "#F59E0B",
		// Above every streak flair: sweeping a slate is a harder single night
		// than any run length on this list.
		sortOrder: 100,
	},
]

// Every team gets a flair, and it stores nothing but a pointer at the team.
// Label, abbreviation and color are read live off the team row at query time
// (see lib/flairs/display.ts) because db/sync/sync-teams.ts rewrites all three
// on every run - a copy here would go stale the first time a team rebrands or
// ESPN corrects a color, and nothing would ever tell us.
//
// Idempotent by `key`, so this is safe to run on every deploy and after every
// team sync. A league added to the catalog later gets its flairs the first
// time this runs after its teams land.
export async function syncTeamFlairs(): Promise<number> {
	const rows = await db.query.teams.findMany({
		columns: { id: true, abbreviation: true },
		with: { league: { columns: { slug: true } } },
	})

	let synced = 0
	for (const team of rows) {
		// leagueId is non-null on teams, so this is the relational builder's
		// nullability rather than a real case. Skipping beats a non-null
		// assertion: a team somehow without a league has no key to build.
		if (!team.league) continue
		synced++
		await db
			.insert(flairs)
			.values({
				key: `team:${team.league.slug}:${team.abbreviation.toLowerCase()}`,
				source: "team",
				// Rooting for someone is not an achievement, so there's nothing to
				// unlock and no grant row to write - this is the flair a brand new
				// account can wear on the day it signs up.
				unlock: "open",
				teamId: team.id,
			})
			.onConflictDoUpdate({
				target: [flairs.key],
				// Re-point and un-retire, nothing else. Display columns stay null
				// on a team flair by design.
				set: { teamId: team.id, status: "active" },
			})
	}

	return synced
}

async function syncAchievementFlairs(): Promise<number> {
	for (const flair of ACHIEVEMENT_FLAIRS) {
		await db
			.insert(flairs)
			.values({
				key: flair.key,
				source: "achievement",
				// Earned, so it needs a userFlairs row. lib/flairs/grant.ts is
				// what writes one.
				unlock: "grant",
				icon: flair.icon,
				label: flair.label,
				color: flair.color,
				description: flair.description,
				sortOrder: flair.sortOrder,
			})
			.onConflictDoUpdate({
				target: [flairs.key],
				set: {
					icon: flair.icon,
					label: flair.label,
					color: flair.color,
					description: flair.description,
					sortOrder: flair.sortOrder,
					status: "active",
				},
			})
	}

	return ACHIEVEMENT_FLAIRS.length
}

export async function syncFlairCatalog(): Promise<{
	team: number
	achievement: number
}> {
	return {
		team: await syncTeamFlairs(),
		achievement: await syncAchievementFlairs(),
	}
}
