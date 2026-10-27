import type { HistoryLeague } from "./franchise-map"

// One player's time with one of today's franchises, as a league's ingester
// reads it from its source. Seasons are the year a season ended.
export type HistoryStint = {
	teamAbbreviation: string
	firstSeason: number
	lastSeason: number
	seasons: number
	// Null where the source doesn't count games (nflverse's season rosters).
	games: number | null
	score: number
	hallOfFame: boolean
}

// One season a player spent with one of today's franchises.
export type HistoryTeamSeason = {
	teamAbbreviation: string
	season: number
}

// One player as a league's source knows him, with every franchise he played
// for. The ids beyond sourceId are crosswalks the writer uses to find a
// player this app already has.
export type HistoryPlayer = {
	// The source's own player id, stored as this player's external ref.
	sourceId: string
	name: string
	position: string | null
	// The bare ESPN athlete id, when a crosswalk knows it.
	espnId: string | null
	// The id the league's own headshot CDN keys photos by (NBA.com person id,
	// MLBAM id, NHL id). Current players carry it inside players.headshotUrl,
	// which makes it an exact link to them.
	imageId: string | null
	// A league CDN headshot for a player this ingest creates, hotlinked the
	// same way the live sync's are.
	headshotUrl: string | null
	// Still playing, per the source. Only an active player can be matched to a
	// current roster by name: a name shared across eras is never evidence.
	active: boolean
	stints: HistoryStint[]
	// Every season behind the stints, for player_team_seasons. A player
	// traded mid-season has a row with each team.
	teamSeasons: HistoryTeamSeason[]
}

// The flat bonus each league's stint score gives a Hall of Famer, on every
// stint he has, so it never decides between two of his franchises. Summing a
// player's stints counts it once per team, which is why a career total takes
// the extras back off (see lib/drafts/pool.ts).
export const HALL_OF_FAME_BONUS = {
	nba: 1_500,
	mlb: 20,
	nhl: 500,
	nfl: 100,
} as const satisfies Record<HistoryLeague, number>

// The external_refs source each league's history is keyed by.
export const HISTORY_SOURCE = {
	nba: "bref",
	mlb: "mlbam",
	nhl: "nhl",
	nfl: "nflverse",
} as const satisfies Record<HistoryLeague, string>

export type Log = (line: string) => void
