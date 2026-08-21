import { db } from "../index"
import { type League, leagues, sports, teams } from "../schema"
import { fetchTeams } from "./espn-client"
import type { SyncLeagueConfig } from "./leagues"
import { linkRef, scopedSourceId } from "./sync-refs"

type SportRow = typeof sports.$inferSelect

async function findOrCreateSport(name: string, slug: string): Promise<SportRow> {
	const existing = await db.query.sports.findFirst({ where: { slug } })
	if (existing) return existing
	const [row] = await db.insert(sports).values({ name, slug }).returning()
	if (!row) throw new Error(`findOrCreateSport: insert returned nothing for ${slug}`)
	return row
}

async function findOrCreateLeague(
	sportId: string,
	config: SyncLeagueConfig,
): Promise<League> {
	const existing = await db.query.leagues.findFirst({
		where: { slug: config.leagueSlug },
	})
	if (existing) return existing
	const [row] = await db
		.insert(leagues)
		.values({
			sportId,
			name: config.leagueName,
			abbreviation: config.leagueAbbreviation,
			slug: config.leagueSlug,
		})
		.returning()
	if (!row) throw new Error(`findOrCreateLeague: insert returned nothing for ${config.leagueSlug}`)
	return row
}

function toHex(color: string): string {
	return `#${color.toUpperCase()}`
}

// Returns the league row so sync-players/sync-games don't have to re-derive
// it - they run right after this for the same config.
export async function syncTeams(config: SyncLeagueConfig): Promise<League> {
	const sport = await findOrCreateSport(config.sportName, config.sportSlug)
	const league = await findOrCreateLeague(sport.id, config)
	const espnTeams = await fetchTeams(config.espnPath)

	for (const espnTeam of espnTeams) {
		await db.transaction(async (tx) => {
			const [row] = await tx
				.insert(teams)
				.values({
					leagueId: league.id,
					name: espnTeam.displayName,
					abbreviation: espnTeam.abbreviation,
					color: toHex(espnTeam.color),
				})
				.onConflictDoUpdate({
					target: [teams.leagueId, teams.abbreviation],
					set: { name: espnTeam.displayName, color: toHex(espnTeam.color) },
				})
				.returning()
			if (!row) throw new Error(`syncTeams: upsert returned nothing for ${espnTeam.id}`)
			await linkRef(tx, "team", scopedSourceId(config.leagueSlug, espnTeam.id), row.id)
		})
	}

	return league
}
