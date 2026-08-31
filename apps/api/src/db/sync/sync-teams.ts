import { db } from "../index"
import { type League, leagues, sports, teams } from "../schema"
import { type EspnGroup, fetchGroups, fetchTeams } from "./espn-client"
import type { SyncLeagueConfig } from "./leagues"
import { linkRef, scopedSourceId } from "./sync-refs"

type SportRow = typeof sports.$inferSelect

async function findOrCreateSport(
	name: string,
	slug: string,
): Promise<SportRow> {
	const existing = await db.query.sports.findFirst({ where: { slug } })
	if (existing) return existing
	const [row] = await db.insert(sports).values({ name, slug }).returning()
	if (!row)
		throw new Error(`findOrCreateSport: insert returned nothing for ${slug}`)
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
			windowType: config.windowType ?? "date",
		})
		.returning()
	if (!row)
		throw new Error(
			`findOrCreateLeague: insert returned nothing for ${config.leagueSlug}`,
		)
	return row
}

function toHex(color: string): string {
	return `#${color.toUpperCase()}`
}

type ConferenceDivision = { conference: string; division: string | null }

// A division's own name sometimes already carries its conference as a
// prefix ("AFC South", "American League East") and sometimes doesn't
// ("Atlantic") - verified live across all three leagues currently synced.
// Stripped so the stored value composes cleanly with conference
// ("AFC" + "South" = "AFC South") regardless of which style a given league
// uses, rather than baking in "AFC AFC South". Left as-is if neither the
// conference's name nor abbreviation is actually a prefix.
function bareDivisionName(conference: EspnGroup, divisionName: string): string {
	for (const prefix of [`${conference.name} `, `${conference.abbreviation} `]) {
		if (divisionName.startsWith(prefix))
			return divisionName.slice(prefix.length)
	}
	return divisionName
}

// Flattens ESPN's groups tree (see fetchGroups) into a per-team lookup. Top-
// level groups are conferences; a conference with `children` treats each
// child as a division, a conference with `teams` directly (no children - not
// seen in the three leagues checked, handled defensively) has no division
// split at all.
function buildConferenceDivisionMap(
	groups: EspnGroup[],
): Map<string, ConferenceDivision> {
	const map = new Map<string, ConferenceDivision>()
	for (const conference of groups) {
		if (conference.children && conference.children.length > 0) {
			for (const division of conference.children) {
				for (const team of division.teams ?? []) {
					map.set(team.id, {
						conference: conference.abbreviation,
						division: bareDivisionName(conference, division.name),
					})
				}
			}
		} else {
			for (const team of conference.teams ?? []) {
				map.set(team.id, {
					conference: conference.abbreviation,
					division: null,
				})
			}
		}
	}
	return map
}

// Returns the league row so sync-players/sync-games don't have to re-derive
// it - they run right after this for the same config.
export async function syncTeams(config: SyncLeagueConfig): Promise<League> {
	const sport = await findOrCreateSport(config.sportName, config.sportSlug)
	const league = await findOrCreateLeague(sport.id, config)
	const espnTeams = await fetchTeams(config.espnPath)
	const groups = await fetchGroups(config.espnPath)
	const conferenceDivisionByEspnId = buildConferenceDivisionMap(groups)

	for (const espnTeam of espnTeams) {
		// ESPN's teams list isn't always just the real franchises - verified
		// live, it can include a non-league entry (e.g. an exhibition
		// opponent like a EuroLeague club playing an NBA preseason game
		// abroad) with no color, which the app has nothing sane to render.
		// Skipped rather than crashing the whole run (which would also take
		// down every league queued after this one in run.ts) - EspnTeam types
		// color as required because every genuine franchise really does have
		// one; this is ESPN's list being wrong, not our types being lax.
		if (!espnTeam.color) {
			console.warn(
				`syncTeams: skipping ${espnTeam.id} (${espnTeam.displayName}) - no color, doesn't look like a real ${config.leagueName} team`,
			)
			continue
		}
		const conferenceDivision = conferenceDivisionByEspnId.get(espnTeam.id)
		await db.transaction(async (tx) => {
			const [row] = await tx
				.insert(teams)
				.values({
					leagueId: league.id,
					name: espnTeam.displayName,
					abbreviation: espnTeam.abbreviation,
					color: toHex(espnTeam.color),
					conference: conferenceDivision?.conference ?? null,
					division: conferenceDivision?.division ?? null,
				})
				.onConflictDoUpdate({
					target: [teams.leagueId, teams.abbreviation],
					set: {
						name: espnTeam.displayName,
						color: toHex(espnTeam.color),
						conference: conferenceDivision?.conference ?? null,
						division: conferenceDivision?.division ?? null,
					},
				})
				.returning()
			if (!row)
				throw new Error(`syncTeams: upsert returned nothing for ${espnTeam.id}`)
			await linkRef(
				tx,
				"team",
				scopedSourceId(config.leagueSlug, espnTeam.id),
				row.id,
			)
		})
	}

	return league
}
