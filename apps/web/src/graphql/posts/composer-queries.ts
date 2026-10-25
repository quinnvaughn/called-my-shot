import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// What the Rushmore composer reads: the leagues and teams to pick a prompt
// from, the prompts themselves, the chosen prompt, and its player pool.

export const RushmoreLeaguesDocument = graphql(`
	query RushmoreLeagues {
		leagues {
			id
			name
			abbreviation
			status
		}
	}
`)

export const rushmoreLeaguesQuery = gqlQueryOptions(RushmoreLeaguesDocument, {})

// A league's teams, each with its own franchise Rushmore prompt.
export const RushmoreTeamsDocument = graphql(`
	query RushmoreTeams($leagueId: ID!, $search: String, $first: Int) {
		teams(leagueId: $leagueId, search: $search, first: $first) {
			id
			name
			abbreviation
			color
			logoUrl
			rushmorePrompt {
				id
				code
				answerCount
			}
		}
	}
`)

export const rushmoreTeamsQuery = (leagueId: string, search: string) =>
	gqlQueryOptions(RushmoreTeamsDocument, {
		leagueId,
		search: search || undefined,
		first: 50,
	})

// Prompts, most answered first: every one, or a league's or team's. It's the
// composer's one search box, and with a typed title how it finds prompts like
// the one about to be made.
export const SearchPromptsDocument = graphql(`
	query SearchPrompts(
		$leagueId: ID
		$teamId: ID
		$query: String
		$first: Int
	) {
		searchPrompts(
			leagueId: $leagueId
			teamId: $teamId
			query: $query
			first: $first
		) {
			id
			code
			title
			answerCount
			isFranchise
			positions
			fromYear
			toYear
			league {
				id
				abbreviation
			}
			team {
				id
				name
				abbreviation
				color
				logoUrl
			}
		}
	}
`)

export const searchPromptsQuery = (variables: {
	leagueId?: string | null
	teamId?: string | null
	query?: string
	first?: number
}) =>
	gqlQueryOptions(SearchPromptsDocument, {
		leagueId: variables.leagueId ?? undefined,
		teamId: variables.teamId ?? undefined,
		query: variables.query || undefined,
		first: variables.first ?? 10,
	})

// The franchise Rushmores of the teams the viewer follows, offered before
// anything is typed.
export const ComposerFollowedTeamsDocument = graphql(`
	query ComposerFollowedTeams {
		myFollows {
			teams {
				id
				name
				abbreviation
				color
				logoUrl
				league {
					id
					abbreviation
				}
				rushmorePrompt {
					id
					code
					title
					answerCount
				}
			}
		}
	}
`)

export const composerFollowedTeamsQuery = gqlQueryOptions(
	ComposerFollowedTeamsDocument,
	{},
)

// The prompt being answered, and the viewer's answer to it for the chosen
// audience if they've made one: groupId null is Everyone.
export const ComposerPromptDocument = graphql(`
	query ComposerPrompt($code: String!, $groupId: ID) {
		prompt(code: $code) {
			id
			code
			title
			color
			answerCount
			isFranchise
			positions
			fromYear
			toYear
			league {
				id
				abbreviation
			}
			team {
				id
				name
				abbreviation
				color
				logoUrl
			}
			viewerAnswer(groupId: $groupId) {
				id
			}
		}
	}
`)

export const composerPromptQuery = (code: string, groupId: string | null) =>
	gqlQueryOptions(ComposerPromptDocument, { code, groupId })

// The players a prompt's Rushmore can be built from, best-known first:
// a team's players for a franchise prompt, the league's for any other.
export const RushmorePoolDocument = graphql(`
	query RushmorePool($promptId: ID!, $search: String, $first: Int) {
		rushmorePool(promptId: $promptId, search: $search, first: $first) {
			firstSeason
			lastSeason
			seasons
			hallOfFame
			player {
				id
				name
				position
				headshotUrl
				portraitUrl
			}
		}
	}
`)

export const rushmorePoolQuery = (promptId: string, search: string) =>
	gqlQueryOptions(RushmorePoolDocument, {
		promptId,
		search: search || undefined,
		first: 20,
	})
