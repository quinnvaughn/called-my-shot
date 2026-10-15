import type { QueryClient } from "@tanstack/react-query"
import { graphql } from "#/graphql/generated"
import {
	AdminGamesDocument,
	AdminLeagueDocument,
	AdminLeaguesDocument,
	AdminPlayersDocument,
	AdminTeamOptionsDocument,
	AdminTeamsDocument,
	LeaguesDocument,
	SportsDocument,
	SportsForAdminDocument,
} from "#/graphql/generated/graphql"
import { invalidateOperations } from "#/graphql/query-options"

// The Data page's leagues, teams, players and games, plus the league pickers
// elsewhere that list league names.
export function invalidateAdminData(queryClient: QueryClient) {
	return invalidateOperations(queryClient, [
		AdminLeaguesDocument,
		AdminLeagueDocument,
		SportsForAdminDocument,
		AdminTeamsDocument,
		AdminTeamOptionsDocument,
		AdminPlayersDocument,
		AdminGamesDocument,
		SportsDocument,
		LeaguesDocument,
	])
}

export const CreateLeagueDocument = graphql(`
	mutation CreateLeague($input: CreateLeagueInput!) {
		createLeague(input: $input) {
			__typename
			... on League {
				id
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
		}
	}
`)

export const UpdateLeagueDocument = graphql(`
	mutation UpdateLeague($input: UpdateLeagueInput!) {
		updateLeague(input: $input) {
			__typename
			... on League {
				id
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const CreateTeamDocument = graphql(`
	mutation CreateTeam($input: CreateTeamInput!) {
		createTeam(input: $input) {
			__typename
			... on Team {
				id
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
		}
	}
`)

export const UpdateTeamDocument = graphql(`
	mutation UpdateTeam($input: UpdateTeamInput!) {
		updateTeam(input: $input) {
			__typename
			... on Team {
				id
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const CreatePlayerDocument = graphql(`
	mutation CreatePlayer($input: CreatePlayerInput!) {
		createPlayer(input: $input) {
			__typename
			... on Player {
				id
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
		}
	}
`)

export const UpdatePlayerDocument = graphql(`
	mutation UpdatePlayer($input: UpdatePlayerInput!) {
		updatePlayer(input: $input) {
			__typename
			... on Player {
				id
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const CreateGameDocument = graphql(`
	mutation CreateGame($input: CreateGameInput!) {
		createGame(input: $input) {
			__typename
			... on Game {
				id
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
		}
	}
`)

export const UpdateGameDocument = graphql(`
	mutation UpdateGame($input: UpdateGameInput!) {
		updateGame(input: $input) {
			__typename
			... on Game {
				id
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`)
