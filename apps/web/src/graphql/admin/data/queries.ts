import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// Data page's own entry point - the paginated/sortable league list. Sports
// selected separately (SportsForAdminDocument below) since the add-league
// modal needs it regardless of which page of leagues is loaded.
export const AdminLeaguesDocument = graphql(`
	query AdminLeagues($sortBy: AdminLeagueSort, $sortDir: SortDirection, $after: String) {
		adminLeagues(sortBy: $sortBy, sortDir: $sortDir, after: $after, first: 100) {
			__typename
			... on QueryAdminLeaguesSuccess {
				data {
					items {
						id
						name
						abbreviation
						slug
						status
						sport {
							id
							name
						}
					}
					pageInfo {
						hasNextPage
						endCursor
					}
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

export const SportsForAdminDocument = graphql(`
	query SportsForAdmin {
		sports {
			id
			name
		}
	}
`)

export const sportsForAdminQuery = gqlQueryOptions(SportsForAdminDocument, {})

// League detail layout's own header - just the name. Kept separate from the
// team-options list below so a page that doesn't need the picker (Teams,
// Games' own layout) doesn't fetch it.
export const AdminLeagueDocument = graphql(`
	query AdminLeague($leagueId: ID!) {
		league(id: $leagueId) {
			id
			name
		}
	}
`)

export const adminLeagueQuery = (leagueId: string) =>
	gqlQueryOptions(AdminLeagueDocument, { leagueId })

// Team picker for the player/game add/edit forms - unpaginated on purpose,
// no real league runs anywhere near the 100-row cap this asks for. Fetched
// only by the Players/Games pages, not the Teams page or the league layout.
export const AdminTeamOptionsDocument = graphql(`
	query AdminTeamOptions($leagueId: ID!) {
		adminTeams(leagueId: $leagueId, first: 100) {
			__typename
			... on QueryAdminTeamsSuccess {
				data {
					items {
						id
						name
						abbreviation
					}
				}
			}
		}
	}
`)

export const adminTeamOptionsQuery = (leagueId: string) =>
	gqlQueryOptions(AdminTeamOptionsDocument, { leagueId })

export const AdminTeamsDocument = graphql(`
	query AdminTeams(
		$leagueId: ID!
		$sortBy: AdminTeamSort
		$sortDir: SortDirection
		$after: String
	) {
		adminTeams(
			leagueId: $leagueId
			sortBy: $sortBy
			sortDir: $sortDir
			after: $after
			first: 100
		) {
			__typename
			... on QueryAdminTeamsSuccess {
				data {
					items {
						id
						name
						abbreviation
						color
						conference
						division
					}
					pageInfo {
						hasNextPage
						endCursor
					}
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

export const AdminPlayersDocument = graphql(`
	query AdminPlayers(
		$leagueId: ID!
		$sortBy: AdminPlayerSort
		$sortDir: SortDirection
		$after: String
	) {
		adminPlayers(
			leagueId: $leagueId
			sortBy: $sortBy
			sortDir: $sortDir
			after: $after
			first: 100
		) {
			__typename
			... on QueryAdminPlayersSuccess {
				data {
					items {
						id
						name
						position
						currentTeam {
							id
							name
							abbreviation
						}
					}
					pageInfo {
						hasNextPage
						endCursor
					}
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

// League-scoped, like adminTeams/adminPlayers above - no other games list
// query exists (Question.game is the only other way to reach a game).
export const AdminGamesDocument = graphql(`
	query AdminGames(
		$leagueId: ID!
		$sortBy: AdminGameSort
		$sortDir: SortDirection
		$after: String
	) {
		adminGames(
			leagueId: $leagueId
			sortBy: $sortBy
			sortDir: $sortDir
			after: $after
			first: 100
		) {
			__typename
			... on QueryAdminGamesSuccess {
				data {
					items {
						id
						startsAt
						status
						homeScore
						awayScore
						homeTeam {
							id
							name
							abbreviation
						}
						awayTeam {
							id
							name
							abbreviation
						}
					}
					pageInfo {
						hasNextPage
						endCursor
					}
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
