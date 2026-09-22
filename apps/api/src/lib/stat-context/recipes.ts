import type { StatContextSlot } from "./types"

// Which cards a stat gets, and in what order.
//
// The default applies to every catalog stat, in every sport, including ones
// that don't exist yet: any stat readable from a stored box score has a game
// log and a season number, and those two are the cards people actually cite.
// A new league that adds extractors gets this much context for free, with no
// edit here.
const DEFAULT_RECIPE: readonly StatContextSlot[] = [
	"recent_form",
	"season_to_date",
	"home_away",
]

// Overrides, keyed exactly the way AUTO_RESOLVE_STATS is
// ("league:scope:subject:catalog stat name"), for stats where the default
// leaves out something that genuinely changes how you'd call it.
//
// Keep this small on purpose. Every entry is a claim that this stat is
// different, and a recipe nobody can justify is just noise on the page. The
// bar is "would a caller's pick change if they saw this" - not "could we
// compute it".
const RECIPES: Partial<Record<string, readonly StatContextSlot[]>> = {
	// Volume stats where the opposing side's generosity is most of the story,
	// and where a share of the team's own total says whether the usage behind
	// the number is real or one loud game.
	"nfl:game:player:Receiving Yards": [
		"recent_form",
		"season_to_date",
		"share_of_team",
		"opponent_allowed",
		"home_away",
	],
	"nfl:game:player:Receptions": [
		"recent_form",
		"season_to_date",
		"share_of_team",
		"opponent_allowed",
	],
	"nfl:game:player:Rushing Yards": [
		"recent_form",
		"season_to_date",
		"share_of_team",
		"opponent_allowed",
	],
	"nfl:game:player:Rushing + Receiving Yards": [
		"recent_form",
		"season_to_date",
		"share_of_team",
		"opponent_allowed",
	],
	"nfl:game:player:Passing Yards": [
		"recent_form",
		"season_to_date",
		"opponent_allowed",
		"home_away",
	],

	// Basketball's schedule is the thing that moves a line most, so rest earns
	// its place here and nowhere a team plays weekly.
	"nba:game:player:Points": [
		"recent_form",
		"season_to_date",
		"opponent_allowed",
		"rest",
		"home_away",
	],
	"nba:game:player:Rebounds": [
		"recent_form",
		"season_to_date",
		"opponent_allowed",
		"rest",
	],
	"nba:game:player:Assists": [
		"recent_form",
		"season_to_date",
		"opponent_allowed",
		"rest",
	],
	"nba:game:player:3-Pointers Made": [
		"recent_form",
		"season_to_date",
		"share_of_team",
		"opponent_allowed",
	],

	// Baseball's home/away gap is a park effect as much as anything, which is
	// worth seeing on a hitter's counting stats.
	"mlb:game:player:Hits": [
		"recent_form",
		"season_to_date",
		"home_away",
		"opponent_allowed",
	],
	"mlb:game:player:Home Runs": [
		"recent_form",
		"season_to_date",
		"home_away",
		"opponent_allowed",
	],
	"mlb:game:player:Strikeouts (Pitching)": [
		"recent_form",
		"season_to_date",
		"opponent_allowed",
	],
}

export function recipeFor(
	autoResolveStatKey: string,
): readonly StatContextSlot[] {
	return RECIPES[autoResolveStatKey] ?? DEFAULT_RECIPE
}
