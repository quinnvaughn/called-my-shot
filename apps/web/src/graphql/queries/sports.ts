import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// The sidebar's persistent league rail (see app-shell.tsx) - fetched once in
// the root route's beforeLoad alongside `me`, not re-queried per page, since
// the league list changes about as often as the sport catalogue itself.
//
// Seasons ride along because the leaderboards' season picker needs them
// before their loaders run, to turn a ?season= search param into a season id
// (the same reason the league list itself lives in context - see _app.tsx).
// startedOnly drops next season's always-synced row, which no call can belong
// to yet. Cheap: a handful of leagues x a couple of seasons each.
export const LeaguesDocument = graphql(`
	query Leagues {
		leagues {
			id
			name
			abbreviation
			slug
			currentSeason {
				id
				year
				displayName
				phase
			}
			seasons(startedOnly: true) {
				id
				year
				displayName
			}
		}
	}
`)

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
			postseason {
				roundLabels
			}
		}
		currentSeason(leagueId: $id) {
			id
			displayName
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
			logoUrl
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
			headshotUrl
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
			typicalPlayerLine
			typicalTeamLine
			toleranceTier {
				id
				toleranceMode
				toleranceValue
			}
		}
	}
`)

// Redisplays the game field's current selection from just the stored gameId
// - normally served straight from the query cache (the game was already
// fetched via GamesByLeague), but a real network fallback if that cache
// entry isn't there, e.g. the field's own component remounted with no local
// memory of what it fetched before.
export const GameByIdDocument = graphql(`
	query GameById($id: ID!) {
		game(id: $id) {
			id
			...GameStarters_game
			startsAt
			status
			homeScore
			awayScore
			venue
			windowKey
			viewerHasReminder
			startTimeTbd
			postseason {
				roundLabel
				homeSeed
				awaySeed
				gameNumber
				bestOf
				ifNecessary
				summary
				clinchTeamIds
				seriesQuestions {
					id
					...QuestionCard_question
				}
			}
			league {
				id
				abbreviation
				slug
				windowType
			}
			homeTeam {
				id
				name
				abbreviation
				color
				logoUrl
			}
			awayTeam {
				id
				name
				abbreviation
				color
				logoUrl
			}
			homeTeamRecord {
				wins
				losses
				ties
				otLosses
			}
			awayTeamRecord {
				wins
				losses
				ties
				otLosses
			}
		}
	}
`)

// The game detail page's two tabs, split on isOfficial. Official: the hero
// (team_vs_team, the "who will win?" question synced onto the game by
// syncGameQuestions) plus the catalog questions generate-game-questions.ts
// posts, put in a fixed order client-side. Community: everything people wrote,
// sortable Most Called/New (see SortSwitcher) - every question on one game
// shares the same locksAt, so a Closing Soon sort would never do anything here.
export const GameQuestionsDocument = graphql(`
	query GameQuestions(
		$gameId: ID!
		$first: Int
		$after: String
		$sort: QuestionSortOrder
		$isOfficial: Boolean
	) {
		questions(
			gameId: $gameId
			first: $first
			after: $after
			sort: $sort
			isOfficial: $isOfficial
		) {
			items {
				id
				shape
				createdAt
				status
				locksAt
				# Read by the page itself for the Official tab's share section
				# (whether there's anything to share, and the tweet's record).
				viewerCall {
					id
					hitTolerance
					totalPoints
					selections {
						id
						option {
							id
							isCorrect
						}
					}
				}
				...QuestionCard_question
				...GameCallsRail_question
			}
			pageInfo {
				hasNextPage
				endCursor
			}
		}
	}
`)

// /games/<id>/picks/<username> - one user's calls on a game's official
// questions. Public like the game page; `entry` is null for an unknown
// username or someone with no official calls on this game.
export const GameEntryDocument = graphql(`
	query GameEntry($id: ID!, $username: String!) {
		game(id: $id) {
			id
			startsAt
			status
			homeScore
			awayScore
			venue
			windowKey
			startTimeTbd
			postseason {
				roundLabel
				homeSeed
				awaySeed
				gameNumber
				ifNecessary
				summary
				clinchTeamIds
			}
			league {
				id
				abbreviation
				slug
			}
			homeTeam {
				id
				name
				abbreviation
				color
				logoUrl
			}
			awayTeam {
				id
				name
				abbreviation
				color
				logoUrl
			}
			homeTeamRecord {
				wins
				losses
				ties
				otLosses
			}
			awayTeamRecord {
				wins
				losses
				ties
				otLosses
			}
			entry(username: $username) {
				calledCount
				wins
				losses
				points
				verdict
				official {
					wins
					losses
					points
				}
				community {
					calledCount
					wins
					losses
					points
				}
				communityMembers {
					question {
						id
					}
					call {
						id
						...CallCard_call
					}
				}
				user {
					id
					name
					username
					avatarUrl
				}
				members {
					question {
						id
						title
						shape
						createdAt
						status
						locksAt
						stat {
							id
							name
						}
						subjectTeam {
							id
							abbreviation
						}
						subjectPlayer {
							id
							name
						}
						options {
							id
							label
						}
					}
					call {
						id
						...CallCard_call
					}
				}
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
				logoUrl
			}
			awayTeam {
				id
				abbreviation
				color
				logoUrl
			}
		}
	}
`)

// The league room's Games tab's jump-to-window control - the full bounded
// list of windows that actually have synced games (a day at a time for
// MLB/NBA, a week at a time for NFL), so a jump can never land on an empty
// date. gameCount is the per-day count the day calendar shows.
export const LeagueGameWindowsDocument = graphql(`
	query LeagueGameWindows($leagueId: ID!) {
		leagueGameWindows(leagueId: $leagueId) {
			key
			label
			gameCount
		}
	}
`)

// The league room's Games tab - unlike GamesByLeagueDocument above (a bounded
// upcoming-only typeahead for the create-question form), this pages through
// the real schedule one window at a time (a day for MLB/NBA, a week for
// NFL - see leagues.windowType). Each response carries its own prevKey/
// nextKey for the prev/next steppers; LeagueGameWindowsDocument above backs
// the jump-to-window control and the "Today"/"Current" reset (windowKey
// omitted -> the server's own default, see pickDefaultWindowIndex).
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
			viewerReportCard {
				...ReportCard_card
			}
			groups {
				slotLabel
				viewerSweep {
					...SlateSweepLine_progress
				}
				games {
					id
					startsAt
					status
					atHalftime
					homeScore
					awayScore
					questionCount
					viewerCalledCount
					startTimeTbd
					postseason {
						homeSeed
						awaySeed
						gameNumber
						ifNecessary
						summary
						clinchTeamIds
					}
					homeTeam {
						id
						name
						abbreviation
						color
						logoUrl
					}
					awayTeam {
						id
						name
						abbreviation
						color
						logoUrl
					}
				}
			}
		}
	}
`)

// The league room's Season tab - published ballots plus every other official
// question with no game behind it (award races today), both scoped
// server-side to the current season (see currentSeasonOnly/leagueBallots' own
// season filter) so a prior year's questions don't linger once a new season
// starts - the current-season display itself lives in the room's shared
// header instead (LeagueByIdDocument), not per-tab. excludeBallotMembers
// keeps a question that's already grouped inside one of those ballots from
// also showing again as a standalone card below it - the ballot card is where
// it's meant to be called from.
// Bounded to 50: a season's worth of official singles for one league is never
// close to that, so no pagination UI is built for this tab.
export const LeagueSeasonDocument = graphql(`
	query LeagueSeason($leagueId: ID!) {
		leagueBallots(leagueId: $leagueId) {
			id
			...BallotCard_ballot
		}
		questions(
			leagueId: $leagueId
			isOfficial: true
			seasonLong: true
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

// Fired on keystroke (debounced) from the league Community tab's search box - a
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
				id
				abbreviation
				color
				logoUrl
			}
		}
	}
`)

// The league room's Community tab - search/sort over the questions people
// wrote, scoped to one fixed league (no league-selector tab here, you're
// already in the room). Official questions never show here: game ones live on
// each game's page, season-long ones on the Season tab. Locked questions are
// excluded too - can't call them, and (no comments yet) there's nothing else
// to do with one from a browse list either; resolved ones stay visible since
// an outcome is still worth seeing.
export const LeagueCommunityDocument = graphql(`
	query LeagueCommunity(
		$leagueId: ID!
		$first: Int
		$after: String
		$teamId: ID
		$search: String
		$sort: QuestionSortOrder
		$excludeSettled: Boolean
		$currentSeasonOnly: Boolean
	) {
		questions(
			leagueId: $leagueId
			first: $first
			after: $after
			teamId: $teamId
			search: $search
			sort: $sort
			isOfficial: false
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

// Fills the admin ballot list's season picker once a league is chosen. Both
// fields in one round trip because the picker needs both: leagueSeasons for
// the options, currentSeason for which one to land on - the newest year isn't
// reliably the current season (the sync pulls this year and next), and
// getCurrentSeason already encodes the real rule.
export const AdminBallotScopeDocument = graphql(`
	query AdminBallotScope($leagueId: ID!) {
		leagueSeasons(leagueId: $leagueId) {
			id
			year
			displayName
		}
		currentSeason(leagueId: $leagueId) {
			id
		}
	}
`)

// The Games tab's series strip - null outside the postseason, so a league in
// its regular season pays for one cheap season read and nothing else.
export const LeaguePostseasonSeriesDocument = graphql(`
	query LeaguePostseasonSeries($leagueId: ID!) {
		league(id: $leagueId) {
			id
			postseason {
				roundLabels
				series {
					id
					winnerTeamId
					...SeriesCard_series
				}
			}
		}
	}
`)

// Shared by the league room's own route and its Games tab, which needs
// windowType off the same league - one cache entry rather than a query each.
export const leagueQuery = (id: string) =>
	gqlQueryOptions(LeagueByIdDocument, { id })
