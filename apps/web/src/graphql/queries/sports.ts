import { graphql } from "#/graphql/generated"

// The sidebar's persistent league rail (see app-shell.tsx) - fetched once in
// the root route's beforeLoad alongside `me`, not re-queried per page, since
// the league list changes about as often as the sport catalogue itself.
export const LeaguesDocument = graphql(`
	query Leagues {
		leagues {
			id
			name
			abbreviation
			slug
		}
	}
`)

// The league room's own header (name/abbreviation) - see routes/_app/leagues.
export const LeagueByIdDocument = graphql(`
	query LeagueById($id: ID!) {
		league(id: $id) {
			id
			name
			abbreviation
			slug
		}
	}
`)

// Sports with their leagues nested in one round trip - the create-question
// form's sport picker drives the league picker client-side from this same
// response instead of firing a second query per sport selection.
export const SportsDocument = graphql(`
	query Sports {
		sports {
			id
			name
			slug
			leagues {
				id
				name
				abbreviation
				slug
			}
		}
	}
`)

// Fetched on demand once a league is picked - scoping teams/players/stats to
// the create-question form's chosen sport/league.
export const TeamsByLeagueDocument = graphql(`
	query TeamsByLeague($leagueId: ID) {
		teams(leagueId: $leagueId) {
			id
			name
			abbreviation
			color
			conference
			division
		}
	}
`)

export const PlayersByLeagueDocument = graphql(`
	query PlayersByLeague($leagueId: ID) {
		players(leagueId: $leagueId) {
			id
			name
			position
			positions
			seasonsInLeague
			rookieEligible
			currentTeam {
				id
				abbreviation
				color
				conference
				division
			}
		}
	}
`)

export const StatsBySportDocument = graphql(`
	query StatsBySport($sportId: ID!) {
		stats(sportId: $sportId) {
			id
			name
			category
			sortOrder
			appliesTo
			toleranceTier {
				id
				toleranceMode
			}
		}
	}
`)

// Redisplays the game field's current selection from just the stored gameId
// - normally served straight from Apollo's cache (the game was already
// fetched via GamesByLeague), but a real network fallback if that cache
// entry isn't there, e.g. the field's own component remounted with no local
// memory of what it fetched before.
export const GameByIdDocument = graphql(`
	query GameById($id: ID!) {
		game(id: $id) {
			id
			startsAt
			status
			homeScore
			awayScore
			homeTeam {
				id
				name
				abbreviation
				color
			}
			awayTeam {
				id
				name
				abbreviation
				color
			}
		}
	}
`)

// The game detail page - every question tied to this game, hero
// (team_vs_team, the "who will win?" question synced onto the game by
// syncGameQuestions) included. No team-subject bucketing here - flat list,
// paginated newest-relevant first via the same HOT sort the home feed uses.
export const GameQuestionsDocument = graphql(`
	query GameQuestions($gameId: ID!, $first: Int, $after: String) {
		questions(gameId: $gameId, first: $first, after: $after, sort: HOT) {
			items {
				id
				shape
				...QuestionCard_question
			}
			pageInfo {
				hasNextPage
				endCursor
			}
		}
	}
`)

// The create-question form's game picker - server-side searched (see the
// `games` resolver) rather than fetched-once-and-filtered like teams/players
// above, since a league's full slate of games can run much larger than its
// roster. Re-run on every query change with the current text (empty text
// still returns a result: that league's soonest upcoming games).
export const GamesByLeagueDocument = graphql(`
	query GamesByLeague($leagueId: ID!, $query: String) {
		games(leagueId: $leagueId, query: $query) {
			id
			startsAt
			status
			homeScore
			awayScore
			homeTeam {
				id
				abbreviation
				color
			}
			awayTeam {
				id
				abbreviation
				color
			}
		}
	}
`)

// The league room's Games tab - unlike GamesByLeagueDocument above (a bounded
// upcoming-only typeahead for the create-question form), this pages through
// the real schedule one window at a time (a day for MLB/NBA, a week for
// NFL - see leagues.windowType). Each response carries its own prevKey/
// nextKey, which is all a prev/next stepper needs - no separate call for the
// full list of windows (that's `leagueGameWindows` on the API, exposed for
// callers that need the whole steppable range, e.g. a future jump-to-window
// picker; this tab doesn't have one yet).
export const LeagueGamesForWindowDocument = graphql(`
	query LeagueGamesForWindow($leagueId: ID!, $windowKey: String) {
		leagueGamesForWindow(leagueId: $leagueId, windowKey: $windowKey) {
			window {
				key
				label
				sublabel
			}
			prevKey
			nextKey
			groups {
				slotLabel
				games {
					id
					startsAt
					status
					homeScore
					awayScore
					questionCount
					viewerCalledCount
					homeTeam {
						id
						name
						abbreviation
						color
					}
					awayTeam {
						id
						name
						abbreviation
						color
					}
				}
			}
		}
	}
`)

// The league room's Season tab - published ballots plus standalone award
// races (player_season_award/team_season_award/player_award_finalists).
// Bounded to 50: a season's worth of award singles for one league is never
// close to that, so no pagination UI is built for this tab.
export const LeagueSeasonDocument = graphql(`
	query LeagueSeason($leagueId: ID!) {
		leagueBallots(leagueId: $leagueId) {
			id
			name
			memberCount
			viewerCalledCount
		}
		questions(
			leagueId: $leagueId
			shapes: [PLAYER_SEASON_AWARD, TEAM_SEASON_AWARD, PLAYER_AWARD_FINALISTS]
			first: 50
		) {
			items {
				id
				...QuestionCard_question
			}
		}
	}
`)

// The league room's Feed tab - the old cross-league home feed's search/sort/
// official-toggle logic, scoped to one fixed league (no league-selector tab
// here, you're already in the room) and with ballot members excluded, since
// those already show grouped under the Season tab.
export const LeagueFeedDocument = graphql(`
	query LeagueFeed(
		$leagueId: ID!
		$first: Int
		$after: String
		$teamId: ID
		$search: String
		$isOfficial: Boolean
		$sort: QuestionSortOrder
	) {
		questions(
			leagueId: $leagueId
			first: $first
			after: $after
			teamId: $teamId
			search: $search
			isOfficial: $isOfficial
			sort: $sort
			excludeBallotMembers: true
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

// Powers the "End of regular season"/"End of playoffs" locksAt quick-fill
// chips in resolution-fields.tsx - only fetched once a league is picked and
// only relevant while locksAt is still manual (no game picked), same gating
// as GameField's league-scoped fetch above.
export const CurrentSeasonByLeagueDocument = graphql(`
	query CurrentSeasonByLeague($leagueId: ID!) {
		currentSeason(leagueId: $leagueId) {
			id
			displayName
			regularSeasonEndsAt
			postseasonEndsAt
		}
	}
`)
