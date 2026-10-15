import type {
	AdminGamesQuery,
	AdminLeaguesQuery,
	AdminPlayersQuery,
	AdminTeamOptionsQuery,
	AdminTeamsQuery,
} from "#/graphql/generated/graphql"

// One row of each Data page table, as its query selects it. The add/edit
// modals take the same row they were opened from.

export type AdminLeagueRow = Extract<
	AdminLeaguesQuery["adminLeagues"],
	{ __typename: "QueryAdminLeaguesSuccess" }
>["data"]["items"][number]

export type AdminTeamRow = Extract<
	AdminTeamsQuery["adminTeams"],
	{ __typename: "QueryAdminTeamsSuccess" }
>["data"]["items"][number]

export type AdminPlayerRow = Extract<
	AdminPlayersQuery["adminPlayers"],
	{ __typename: "QueryAdminPlayersSuccess" }
>["data"]["items"][number]

export type AdminGameRow = Extract<
	AdminGamesQuery["adminGames"],
	{ __typename: "QueryAdminGamesSuccess" }
>["data"]["items"][number]

// A team in the player and game forms' pickers.
export type AdminTeamOption = Extract<
	AdminTeamOptionsQuery["adminTeams"],
	{ __typename: "QueryAdminTeamsSuccess" }
>["data"]["items"][number]
