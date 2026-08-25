import type { EspnAthlete, EspnSportPath } from "./espn-client"
import { resolveMlbRookieEligible } from "./mlb-rookie-eligibility"

export type SyncLeagueConfig = {
	sportName: string
	sportSlug: string
	leagueName: string
	leagueAbbreviation: string
	leagueSlug: string
	espnPath: EspnSportPath
	// Decides players.rookieEligible for this league (see its comment in
	// db/schema/sports.ts) - omitted for leagues where "zero prior seasons in
	// the league" (syncPlayers' own default) is an accurate enough proxy for
	// real rookie status. MLB overrides it because that's not true there - a
	// brief prior-season call-up trips seasonsInLeague to 1 without costing
	// real MLB rookie status.
	resolveRookieEligible?: (
		athlete: EspnAthlete,
		teamAbbreviation: string,
		currentSeasonYear: number,
	) => Promise<boolean>
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
	{
		sportName: "Baseball",
		sportSlug: "baseball",
		leagueName: "MLB",
		leagueAbbreviation: "MLB",
		leagueSlug: "mlb",
		espnPath: "baseball/mlb",
		resolveRookieEligible: resolveMlbRookieEligible,
	},
]
