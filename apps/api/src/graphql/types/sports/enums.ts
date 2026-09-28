import { builder } from "../../builder"

export const LeagueStatus = builder.enumType("LeagueStatus", {
	values: {
		ACTIVE: { value: "active" },
		INACTIVE: { value: "inactive" },
	},
})

export const GameStatus = builder.enumType("GameStatus", {
	values: {
		SCHEDULED: { value: "scheduled" },
		LIVE: { value: "live" },
		FINAL: { value: "final" },
	},
})

// A finished game called all right or all wrong - see gameEntryVerdict in
// lib/game-entry.ts.
export const GameEntryVerdict = builder.enumType("GameEntryVerdict", {
	values: {
		PERFECT: { value: "perfect" },
		OH_FER: { value: "oh_fer" },
	},
})

// How a league's Games tab pages through its schedule - see
// leagues.windowType's comment in db/schema/sports.ts.
export const LeagueWindowType = builder.enumType("LeagueWindowType", {
	values: {
		DATE: { value: "date" },
		WEEK: { value: "week" },
	},
})

// Which slice of a team's lineup a starter is - see gameStarterRole in
// db/schema/game-starters.ts.
export const GameStarterRole = builder.enumType("GameStarterRole", {
	values: {
		STARTING_PITCHER: { value: "starting_pitcher" },
		BATTER: { value: "batter" },
		OFFENSE: { value: "offense" },
		DEFENSE: { value: "defense" },
		STARTER: { value: "starter" },
	},
})

export const ToleranceMode = builder.enumType("ToleranceMode", {
	values: {
		PERCENTAGE: { value: "percentage" },
		ABSOLUTE: { value: "absolute" },
	},
})

export const StatAppliesTo = builder.enumType("StatAppliesTo", {
	values: {
		PLAYER: { value: "player" },
		TEAM: { value: "team" },
		BOTH: { value: "both" },
	},
})

export const AdminLeagueSort = builder.enumType("AdminLeagueSort", {
	values: { NAME: { value: "name" }, STATUS: { value: "status" } },
})
export const AdminTeamSort = builder.enumType("AdminTeamSort", {
	values: { NAME: { value: "name" }, ABBREVIATION: { value: "abbreviation" } },
})
export const AdminPlayerSort = builder.enumType("AdminPlayerSort", {
	values: { NAME: { value: "name" }, POSITION: { value: "position" } },
})
export const AdminGameSort = builder.enumType("AdminGameSort", {
	values: { STARTS_AT: { value: "startsAt" }, STATUS: { value: "status" } },
})
