import { syncTeamFlairs } from "../catalog/flairs"
import { db } from "../index"
import { type League, leagues, sports, teams } from "../schema"
import {
	defaultEspnClient,
	type EspnClient,
	type EspnGroup,
} from "./espn-client"
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

// Upserted rather than created-once: every column here is derived from
// SYNCED_LEAGUES, so a league that already exists has to pick up later edits
// to its own config on the next sync run. windowType is the one that visibly
// matters - a league created before it was set keeps the schema default
// ("date"), which leaves the Games tab paging that league one day at a time
// no matter what its config says. status is left alone, being operational
// state rather than config.
async function upsertLeague(
	sportId: string,
	config: SyncLeagueConfig,
): Promise<League> {
	const fromConfig = {
		sportId,
		name: config.leagueName,
		abbreviation: config.leagueAbbreviation,
		windowType: config.windowType ?? "date",
	}
	const [row] = await db
		.insert(leagues)
		.values({ ...fromConfig, slug: config.leagueSlug })
		.onConflictDoUpdate({ target: leagues.slug, set: fromConfig })
		.returning()
	if (!row)
		throw new Error(
			`upsertLeague: upsert returned nothing for ${config.leagueSlug}`,
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
export async function syncTeams(
	config: SyncLeagueConfig,
	espn: EspnClient = defaultEspnClient,
): Promise<League> {
	const sport = await findOrCreateSport(config.sportName, config.sportSlug)
	const league = await upsertLeague(sport.id, config)
	const espnTeams = await espn.fetchTeams(config.espnPath)
	const groups = await espn.fetchGroups(config.espnPath)
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

	// Give any team that just landed its flair, rather than waiting for the
	// next deploy to run the catalog. A team ESPN adds mid-season is otherwise
	// the one team nobody can root for. Idempotent, so re-running costs a
	// no-op upsert per team.
	await syncTeamFlairs()

	return league
}
