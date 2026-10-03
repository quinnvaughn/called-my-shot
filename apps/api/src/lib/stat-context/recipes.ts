import type { StatContextSlot, UsageStat, WorkloadStat } from "./types"

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
	// and where the opportunity behind the number - targets, carries - says
	// whether the production is usage or one loud game. Usage rather than a
	// share of the same stat: yards swing week to week and the touches behind
	// them don't, so a target share is the figure that still holds next Sunday.
	"nfl:game:player:Receiving Yards": [
		"recent_form",
		"season_to_date",
		"usage",
		"opponent_allowed",
		"home_away",
	],
	"nfl:game:player:Receptions": [
		"recent_form",
		"season_to_date",
		"usage",
		"opponent_allowed",
	],
	"nfl:game:player:Rushing Yards": [
		"recent_form",
		"season_to_date",
		"usage",
		"opponent_allowed",
	],
	"nfl:game:player:Rushing + Receiving Yards": [
		"recent_form",
		"season_to_date",
		"usage",
		"opponent_allowed",
	],
	"nfl:game:player:Passing Yards": [
		"recent_form",
		"season_to_date",
		"opponent_allowed",
		"home_away",
	],

	// A team's own scoring is half the question; what the other side gives up
	// is the other half. Without it the card shows the same number whoever
	// they're playing, which is the one comparison a caller most wants to make.
	"nfl:game:team:Points": [
		"recent_form",
		"season_to_date",
		"opponent_allowed",
		"home_away",
	],
	"nba:game:team:Points": [
		"recent_form",
		"season_to_date",
		"opponent_allowed",
		"home_away",
	],
	"mlb:game:team:Runs": [
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
	// A pitcher's strikeouts are capped by how long he's left in, which is
	// what separates an opener from a starter with the same strikeout rate.
	"mlb:game:player:Strikeouts (Pitching)": [
		"recent_form",
		"season_to_date",
		"workload",
		"opponent_allowed",
	],
}

// The column the usage card counts, per stat. Keyed exactly like RECIPES, and
// only meaningful for a stat whose own volume is handed out by someone else:
// a quarterback's attempts are his team's attempts, so passing has no entry
// here and the card it would draw would always read 100%.
//
// Both keys are stored on every NFL box score whether or not a catalog stat
// reads them, so nothing here needs an extractor of its own.
const USAGE_STATS: Partial<Record<string, UsageStat>> = {
	"nfl:game:player:Receiving Yards": {
		label: "targets",
		statKeys: ["receiving.receivingTargets"],
	},
	"nfl:game:player:Receptions": {
		label: "targets",
		statKeys: ["receiving.receivingTargets"],
	},
	"nfl:game:player:Rushing Yards": {
		label: "carries",
		statKeys: ["rushing.rushingAttempts"],
	},
	// A back's day is both, and counting only one of them understates a
	// receiving back on exactly the question where his floor is the argument.
	"nfl:game:player:Rushing + Receiving Yards": {
		label: "carries + targets",
		statKeys: ["rushing.rushingAttempts", "receiving.receivingTargets"],
	},
}

// The column the workload card averages, per stat. Keyed exactly like
// RECIPES.
const WORKLOAD_STATS: Partial<Record<string, WorkloadStat>> = {
	"mlb:game:player:Strikeouts (Pitching)": {
		label: "pitches",
		statKeys: ["pitching.pitches"],
	},
}

export function workloadStatFor(
	autoResolveStatKey: string,
): WorkloadStat | null {
	return WORKLOAD_STATS[autoResolveStatKey] ?? null
}

export function usageStatFor(autoResolveStatKey: string): UsageStat | null {
	return USAGE_STATS[autoResolveStatKey] ?? null
}

export function recipeFor(
	autoResolveStatKey: string,
): readonly StatContextSlot[] {
	return RECIPES[autoResolveStatKey] ?? DEFAULT_RECIPE
}
