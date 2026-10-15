import { graphql } from "#/graphql/generated"

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
				...Team_team @unmask
			}
			awayTeam {
				...Team_team @unmask
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
