import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// The league room's own header (name/abbreviation/current season/current
// window's game count, and the rounds on during a postseason) - see
// routes/_app/leagues. currentSeason and
// currentWindowGameCount are fetched here, not per-tab, since the header
// shows them on every tab (Games/Season/Feed), not just Season/Games. No live
// count yet - that data isn't reliable enough to surface.
export const LeagueByIdDocument = graphql(`
	query LeagueById($id: ID!) {
		league(id: $id) {
			id
			name
			abbreviation
			slug
			windowType
			currentWindowGameCount
			viewerFollows
			postseason {
				roundLabels
			}
			viewerSeasonPlay {
				weight
				weeks {
					startsOn
					calls
					played
					over
				}
			}
		}
		currentSeason(leagueId: $id) {
			id
			displayName
		}
	}
`)

// Shared by the league room's own route and its Games tab, which needs
// windowType off the same league - one cache entry rather than a query each.
export const leagueQuery = (id: string) =>
	gqlQueryOptions(LeagueByIdDocument, { id })

// The league's Teams tab: every franchise, each linking to its team space
// with a follow toggle beside it.
export const LeagueTeamsDocument = graphql(`
	query LeagueTeams($leagueId: ID!) {
		league(id: $leagueId) {
			id
			teams {
				id
				name
				abbreviation
				color
				logoUrl
				viewerFollows
			}
		}
	}
`)

export const leagueTeamsQuery = (leagueId: string) =>
	gqlQueryOptions(LeagueTeamsDocument, { leagueId })

// A team space, addressed by its league and lowercased abbreviation. There's
// no lookup by abbreviation, so this reads the league's whole list and the
// route picks the team out of it; the franchise prompt comes along for the
// consensus card.
export const LeagueTeamSpaceDocument = graphql(`
	query LeagueTeamSpace($leagueId: ID!) {
		league(id: $leagueId) {
			id
			teams {
				id
				name
				abbreviation
				color
				logoUrl
				conference
				division
				viewerFollows
				rushmorePrompt {
					id
					code
				}
			}
		}
	}
`)

export const leagueTeamSpaceQuery = (leagueId: string) =>
	gqlQueryOptions(LeagueTeamSpaceDocument, { leagueId })

// Fired on keystroke (debounced) from a league question list's search box - a
// bounded, server-side team/player autocomplete scoped to this league, same
// shape the old cross-league home feed's search bar used before it was
// rebuilt away (HomeSearchDocument, now deleted) - client-filtering the full
// teams/players tables client-side is what that was replaced to avoid, not
// autocomplete itself.
export const LeagueSearchDocument = graphql(`
	query LeagueSearch($leagueId: ID!, $search: String!) {
		teams(leagueId: $leagueId, search: $search, first: 5) {
			id
			name
			abbreviation
			color
			logoUrl
		}
		players(leagueId: $leagueId, search: $search, first: 5) {
			id
			name
			currentTeam {
				...Team_team @unmask
			}
		}
	}
`)

// The league room's Season tab - search/sort over one fixed league's
// season-long questions that aren't awards, official and player-written
// together (no league-selector here, you're already in the room). Locked
// questions are excluded - can't call
// them, and (no comments yet) there's nothing else to do with one from a
// browse list either; resolved ones stay visible unless excludeSettled says
// otherwise, since an outcome is still worth seeing.
export const LeagueSeasonDocument = graphql(`
	query LeagueSeason(
		$leagueId: ID!
		$first: Int
		$after: String
		$teamId: ID
		$search: String
		$sort: QuestionSortOrder
		$excludeSettled: Boolean
		$currentSeasonOnly: Boolean
		$seasonLong: Boolean
		$excludeSeasonAwards: Boolean
		$excludeBallotMembers: Boolean
	) {
		questions(
			leagueId: $leagueId
			first: $first
			after: $after
			teamId: $teamId
			search: $search
			sort: $sort
			seasonLong: $seasonLong
			excludeSeasonAwards: $excludeSeasonAwards
			excludeBallotMembers: $excludeBallotMembers
			excludeLocked: true
			excludeSettled: $excludeSettled
			currentSeasonOnly: $currentSeasonOnly
		) {
			items {
				id
				...QuestionCard_question
			}
			pageInfo {
				hasNextPage
				endCursor
			}
		}
	}
`)

// The Season tab's Closing Soon row. Its own document rather than
// LeagueSeason with sort: CLOSING_SOON, since that one backs an
// infinite query and a plain query can't share its cache key. Takes the same
// scope variables as the list it sits above.
export const LeagueSeasonClosingSoonDocument = graphql(`
	query LeagueSeasonClosingSoon(
		$leagueId: ID!
		$first: Int
		$seasonLong: Boolean
		$excludeSeasonAwards: Boolean
		$excludeBallotMembers: Boolean
	) {
		questions(
			leagueId: $leagueId
			first: $first
			sort: CLOSING_SOON
			seasonLong: $seasonLong
			excludeSeasonAwards: $excludeSeasonAwards
			excludeBallotMembers: $excludeBallotMembers
		) {
			items {
				id
				...QuestionCard_question
			}
		}
	}
`)

// The league room's Ballots tab - published ballots plus every award and
// title question outside them, official and player-written alike, both
// scoped server-side to the current season (see currentSeasonOnly/
// leagueBallots' own season filter) so a prior year's questions don't linger
// once a new season starts. excludeBallotMembers keeps a question that's
// already grouped inside one of those ballots from also showing again as a
// standalone card below it - the ballot card is where it's meant to be called
// from. Bounded to 50: a season's awards for one league are never close to
// that, so no pagination UI is built for this tab.
export const LeagueBallotsDocument = graphql(`
	query LeagueBallots($leagueId: ID!) {
		leagueBallots(leagueId: $leagueId) {
			id
			...BallotCard_ballot
		}
		questions(
			leagueId: $leagueId
			shapes: [PLAYER_SEASON_AWARD, TEAM_SEASON_AWARD, PLAYER_AWARD_FINALISTS]
			currentSeasonOnly: true
			excludeBallotMembers: true
			first: 50
		) {
			items {
				id
				...QuestionCard_question
			}
		}
	}
`)
