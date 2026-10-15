import { graphql } from "#/graphql/generated"

export const StatContextTrackRecordFragment = graphql(`
	fragment StatContextCard_trackRecord on TrackRecord {
		label
		rows {
			label
			sides {
				label
				wins
				losses
				netPoints
			}
		}
	}
`)

export const StatContextCardFragment = graphql(`
	fragment StatContextCard_statContext on StatContext {
		statLabel
		lastN
		mismatch
		ranking {
			playerId
			player {
				id
				headshotUrl
			}
			label
			mean
			games
			opponentTeamId
			isHome
		}
		defenses {
			teamId
			games
			meanAllowed
		}
		subjects {
			label
			player {
				id
				name
				headshotUrl
			}
			team {
				...Team_team @unmask
			}
			recentGames {
				gameId
				date
				opponentTeamId
				isHome
				value
				didNotPlay
			}
			seasonToDate {
				games
				mean
				overLine
			}
			home {
				games
				mean
			}
			away {
				games
				mean
			}
			rest {
				medianRestDays
				shortRest {
					games
					mean
				}
				longRest {
					games
					mean
				}
			}
			opponentAllowed {
				teamId
				games
				meanAllowed
				positions
			}
			teamShare {
				sharePct
				games
			}
			usage {
				label
				games
				perGame
				sharePct
			}
		}
		matchup {
			focus
			sides {
				label
				teamId
				team {
					...Team_team @unmask
				}
				isHome
				differential {
					kind
					value
					games
				}
				overall {
					games
					pointsForPerGame
					pointsAgainstPerGame
					overLine
				}
				inThisRole {
					games
					wins
					losses
					ties
					otLosses
				}
				headToHead {
					games
					wins
					losses
					ties
					otLosses
				}
				lastTen {
					games
					wins
					losses
					ties
					otLosses
				}
				streak {
					outcome
					length
				}
				restDays
				recentResults {
					gameId
					date
					opponentAbbreviation
					isHome
					pointsFor
					pointsAgainst
					outcome
				}
			}
			meetings {
				gameId
				date
				homeTeamId
				awayTeamId
				homeScore
				awayScore
			}
			includesPostseason
		}
	}
`)
