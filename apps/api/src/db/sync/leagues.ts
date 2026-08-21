import type { EspnSportPath } from "./espn-client"

export type SyncLeagueConfig = {
	sportName: string
	sportSlug: string
	leagueName: string
	leagueAbbreviation: string
	leagueSlug: string
	espnPath: EspnSportPath
}

export const SYNCED_LEAGUES: SyncLeagueConfig[] = [
	{
		sportName: "Basketball",
		sportSlug: "basketball",
		leagueName: "NBA",
		leagueAbbreviation: "NBA",
		leagueSlug: "nba",
		espnPath: "basketball/nba",
	},
	{
		sportName: "Football",
		sportSlug: "football",
		leagueName: "NFL",
		leagueAbbreviation: "NFL",
		leagueSlug: "nfl",
		espnPath: "football/nfl",
	},
]
