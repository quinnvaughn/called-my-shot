import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// What the composers read. The Rushmore composer: the leagues and teams to
// pick a prompt from, the prompts themselves, the chosen prompt, and its
// player pool. The redraft composer: draft classes, the chosen class, and
// who's in it.

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

// Draft classes for the redraft composer: one league's or every one's,
// searched by year or a player in the class, newest first.
export const RedraftClassesDocument = graphql(`
	query RedraftClasses($leagueId: ID, $query: String, $first: Int) {
		redraftClasses(leagueId: $leagueId, query: $query, first: $first) {
			id
			code
			title
			draftYear
			answerCount
			league {
				id
				abbreviation
			}
		}
	}
`)

export const redraftClassesQuery = (leagueId: string | null, query: string) =>
	gqlQueryOptions(RedraftClassesDocument, {
		leagueId: leagueId ?? undefined,
		query: query || undefined,
		first: 12,
	})

// The class being redrafted: its lengths, its real picks as far as its
// longest length, and the viewer's redraft of it for the chosen audience if
// they've made one (groupId null is Everyone).
export const ComposerRedraftDocument = graphql(`
	query ComposerRedraft($code: String!, $groupId: ID) {
		redraftPrompt(code: $code) {
			id
			code
			title
			color
			draftYear
			answerCount
			league {
				id
				abbreviation
			}
			lengths {
				count
				label
				isDefault
			}
			slots {
				slot
				overall
				teamName
				playerName
				team {
					id
					abbreviation
					color
					logoUrl
				}
			}
			viewerAnswer(groupId: $groupId) {
				id
			}
		}
	}
`)

export const composerRedraftQuery = (code: string, groupId: string | null) =>
	gqlQueryOptions(ComposerRedraftDocument, { code, groupId })

// Who can go in a redraft of the class, best careers first.
export const RedraftPoolDocument = graphql(`
	query RedraftPool($promptId: ID!, $search: String, $first: Int) {
		redraftPool(promptId: $promptId, search: $search, first: $first) {
			overall
			firstSeason
			lastSeason
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

export const redraftPoolQuery = (promptId: string, search: string) =>
	gqlQueryOptions(RedraftPoolDocument, {
		promptId,
		search: search || undefined,
		first: 20,
	})
