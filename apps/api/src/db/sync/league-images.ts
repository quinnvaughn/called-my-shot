import { setTimeout as sleep } from "node:timers/promises"
import type { EspnAthlete, EspnTeam } from "./espn-client"
import { getMlbRosterIndex, getMlbTeams } from "./mlb-rosters"
import { buildNameIndex, findByName, normalizeName } from "./name-match"
import { fetchNbaPlayers, type NbaPlayer } from "./nba-client"
import {
	fetchNhlRoster,
	fetchNhlTeams,
	type NhlRosterPlayer,
	type NhlTeam,
} from "./nhl-client"

// Where a league's team logos and player headshots come from: the league's
// own CDN, keyed by the league's own ids, so the photos are the league's
// rather than a wire service's. Resolved once per sync and stored on the row
// (teams.logoUrl, players.headshotUrl), never looked up at request time. The
// NFL is the exception for headshots - its CDN keys photos by an opaque image
// id that no roster feed exposes, so those come from ESPN's roster entry.
//
// Logos are each league's on-dark variant where it has one, since the app
// only has a dark theme.
//
// A null means no match, and a source that fails to load resolves every
// lookup to null rather than failing the sync: a missing image falls back to
// initials, while a failed team or player step leaves real data stale.
export type LeagueImages = {
	teamLogoUrl: (team: EspnTeam) => Promise<string | null>
	headshotUrl: (athlete: EspnAthlete, team: EspnTeam) => Promise<string | null>
}

// Loads a source once per sync run, and logs a failure once rather than once
// per player.
function cachedSource<T>(
	label: string,
	load: () => Promise<T>,
): () => Promise<T | null> {
	let loaded: Promise<T | null> | null = null
	return () => {
		loaded ??= load().catch((err) => {
			console.error(`[league-images] ${label} unavailable:`, err)
			return null
		})
		return loaded
	}
}

const nbaSource = cachedSource("nba.com players", async () => {
	const players = await fetchNbaPlayers()
	const teamName = (p: NbaPlayer) => `${p.TEAM_CITY} ${p.TEAM_NAME}`
	return {
		players: buildNameIndex(
			players.map((p) => ({
				team: teamName(p),
				name: `${p.PLAYER_FIRST_NAME} ${p.PLAYER_LAST_NAME}`,
				value: p.PERSON_ID,
			})),
		),
		teamIds: new Map(
			players.map((p) => [normalizeName(teamName(p)), p.TEAM_ID]),
		),
	}
})

export const nbaImages: LeagueImages = {
	teamLogoUrl: async (team) => {
		const id = (await nbaSource())?.teamIds.get(normalizeName(team.displayName))
		return id ? `https://cdn.nba.com/logos/nba/${id}/primary/D/logo.svg` : null
	},
	headshotUrl: async (athlete, team) => {
		const source = await nbaSource()
		const id = source
			? findByName(source.players, athlete.fullName, team.displayName)
			: null
		return id
			? `https://cdn.nba.com/headshots/nba/latest/1040x760/${id}.png`
			: null
	},
}

// The same roster index rookie eligibility reads (mlb-rosters.ts), so MLB
// is only asked once per sync for both.
const mlbSource = cachedSource("MLB rosters", async () => ({
	players: await getMlbRosterIndex(),
	teamIds: new Map(
		(await getMlbTeams()).map((t) => [normalizeName(t.name), t.id]),
	),
}))

export const mlbImages: LeagueImages = {
	teamLogoUrl: async (team) => {
		const id = (await mlbSource())?.teamIds.get(normalizeName(team.displayName))
		return id
			? `https://www.mlbstatic.com/team-logos/team-primary-on-dark/${id}.svg`
			: null
	},
	// Without MLB's d_people:generic default segment, so an id with no photo
	// 404s into the initials fallback instead of rendering a silhouette.
	headshotUrl: async (athlete, team) => {
		const source = await mlbSource()
		const entry = source
			? findByName(source.players, athlete.fullName, team.displayName)
			: null
		return entry
			? `https://img.mlbstatic.com/mlb-photos/image/upload/w_213,q_auto:best/v1/people/${entry.person.id}/headshot/67/current`
			: null
	},
}

const NHL_SPACING_MS = 250

// The current roster drops players ESPN still lists (verified live in the
// preseason: Troy Terry and Dylan Larkin were missing from it), so last
// season's roster backs it up. Keyed by NHL id so a player on both counts
// once - the name index reads a repeated name as two different players - and
// the current season's photo wins.
const nhlSource = cachedSource("NHL rosters", async () => {
	const teams = await fetchNhlTeams()
	// One request at a time: the NHL answers 429 to all 64 at once.
	const rosters: { team: NhlTeam; roster: NhlRosterPlayer[] }[] = []
	for (const team of teams) {
		const roster: NhlRosterPlayer[] = []
		for (const season of ["current", team.seasonId - 10001] as const) {
			roster.push(...(await fetchNhlRoster(team.teamAbbrev.default, season)))
			await sleep(NHL_SPACING_MS)
		}
		rosters.push({ team, roster })
	}
	const byId = new Map<number, { team: string; name: string; value: string }>()
	for (const { team, roster } of rosters) {
		for (const player of roster) {
			if (byId.has(player.id)) continue
			byId.set(player.id, {
				team: team.teamName.default,
				name: `${player.firstName.default} ${player.lastName.default}`,
				value: player.headshot,
			})
		}
	}
	return {
		players: buildNameIndex([...byId.values()]),
		teams: new Map<string, NhlTeam>(
			teams.map((team) => [normalizeName(team.teamName.default), team]),
		),
	}
})

export const nhlImages: LeagueImages = {
	teamLogoUrl: async (team) => {
		const nhlTeam = (await nhlSource())?.teams.get(
			normalizeName(team.displayName),
		)
		return nhlTeam
			? `https://assets.nhle.com/logos/nhl/svg/${nhlTeam.teamAbbrev.default}_dark.svg`
			: null
	},
	headshotUrl: async (athlete, team) => {
		const source = await nhlSource()
		return source
			? findByName(source.players, athlete.fullName, team.displayName)
			: null
	},
}

// nfl.com keys logos by club abbreviation, which agrees with ESPN's for every
// team but Washington (verified live against all 32). It serves one variant,
// not a light and dark pair.
const NFL_CLUB_ABBREVIATIONS: Record<string, string> = { WSH: "WAS" }

export const nflImages: LeagueImages = {
	teamLogoUrl: async (team) =>
		`https://static.www.nfl.com/league/api/clubs/logos/${NFL_CLUB_ABBREVIATIONS[team.abbreviation] ?? team.abbreviation}.svg`,
	headshotUrl: async (athlete) => athlete.headshot?.href ?? null,
}
