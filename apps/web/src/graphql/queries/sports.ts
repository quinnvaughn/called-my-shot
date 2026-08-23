import { graphql } from "#/graphql/generated"

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
// the create-question form's chosen sport/league, unlike HomePageDocument's
// unscoped lists (which deliberately span every league for search).
export const TeamsByLeagueDocument = graphql(`
	query TeamsByLeague($leagueId: ID) {
		teams(leagueId: $leagueId) {
			id
			name
			abbreviation
			color
		}
	}
`)

export const PlayersByLeagueDocument = graphql(`
	query PlayersByLeague($leagueId: ID) {
		players(leagueId: $leagueId) {
			id
			name
			currentTeam {
				id
				abbreviation
				color
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
