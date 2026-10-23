import type { SeasonLeague } from "../season-puzzles/archive-parse"

// The player stats Blind Rank ranks, per league: how a season prompt and a
// career prompt name each one, and where its numbers come from.
export type PlayerRankStat = {
	// ESPN's season leaders category, "passingYards".
	category: string
	// "Passing yards" in a season prompt.
	seasonLabel: string
	// Decimal places a season value shows with (per-game stats have one).
	seasonDecimals: number
	// ESPN's career stat, "passing.passingYards": the group, then the stat.
	careerKey: string
	// "Career passing yards".
	careerLabel: string
}

export const PLAYER_RANK_STATS: Record<SeasonLeague, PlayerRankStat[]> = {
	nfl: [
		{
			category: "passingYards",
			seasonLabel: "Passing yards",
			seasonDecimals: 0,
			careerKey: "passing.passingYards",
			careerLabel: "Career passing yards",
		},
		{
			category: "rushingYards",
			seasonLabel: "Rushing yards",
			seasonDecimals: 0,
			careerKey: "rushing.rushingYards",
			careerLabel: "Career rushing yards",
		},
		{
			category: "receivingYards",
			seasonLabel: "Receiving yards",
			seasonDecimals: 0,
			careerKey: "receiving.receivingYards",
			careerLabel: "Career receiving yards",
		},
		{
			category: "passingTouchdowns",
			seasonLabel: "Passing touchdowns",
			seasonDecimals: 0,
			careerKey: "passing.passingTouchdowns",
			careerLabel: "Career passing touchdowns",
		},
		{
			category: "sacks",
			seasonLabel: "Sacks",
			seasonDecimals: 1,
			careerKey: "defensive.sacks",
			careerLabel: "Career sacks",
		},
	],
	nba: [
		{
			category: "pointsPerGame",
			seasonLabel: "Points per game",
			seasonDecimals: 1,
			careerKey: "offensive.points",
			careerLabel: "Career points",
		},
		{
			category: "reboundsPerGame",
			seasonLabel: "Rebounds per game",
			seasonDecimals: 1,
			careerKey: "general.rebounds",
			careerLabel: "Career rebounds",
		},
		{
			category: "assistsPerGame",
			seasonLabel: "Assists per game",
			seasonDecimals: 1,
			careerKey: "offensive.assists",
			careerLabel: "Career assists",
		},
	],
	mlb: [
		{
			category: "homeRuns",
			seasonLabel: "Home runs",
			seasonDecimals: 0,
			careerKey: "batting.homeRuns",
			careerLabel: "Career home runs",
		},
		{
			category: "RBIs",
			seasonLabel: "RBI",
			seasonDecimals: 0,
			careerKey: "batting.RBIs",
			careerLabel: "Career RBI",
		},
		{
			category: "hits",
			seasonLabel: "Hits",
			seasonDecimals: 0,
			careerKey: "batting.hits",
			careerLabel: "Career hits",
		},
		{
			category: "wins",
			seasonLabel: "Pitching wins",
			seasonDecimals: 0,
			careerKey: "pitching.wins",
			careerLabel: "Career pitching wins",
		},
		{
			category: "strikeouts",
			seasonLabel: "Strikeouts (pitching)",
			seasonDecimals: 0,
			careerKey: "pitching.strikeouts",
			careerLabel: "Career strikeouts (pitching)",
		},
	],
	nhl: [
		{
			category: "goals",
			seasonLabel: "Goals",
			seasonDecimals: 0,
			careerKey: "offensive.goals",
			careerLabel: "Career goals",
		},
		{
			category: "assists",
			seasonLabel: "Assists",
			seasonDecimals: 0,
			careerKey: "offensive.assists",
			careerLabel: "Career assists",
		},
		{
			category: "points",
			seasonLabel: "Points",
			seasonDecimals: 0,
			careerKey: "offensive.points",
			careerLabel: "Career points",
		},
	],
}

// "4,806", or "30.4" for a per-game stat.
export function formatRankValue(value: number, decimals: number): string {
	return value.toLocaleString("en-US", {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	})
}

// What each league calls scoring, for the team prompts.
export const SCORING_WORD: Record<SeasonLeague, string> = {
	nfl: "Points",
	nba: "Points",
	mlb: "Runs",
	nhl: "Goals",
}
