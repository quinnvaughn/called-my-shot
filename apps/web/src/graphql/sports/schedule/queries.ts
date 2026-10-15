import { graphql } from "#/graphql/generated"

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

// The league room's Games tab - unlike GamesByLeagueDocument in
// sports/catalog (a bounded upcoming-only typeahead for the create-question
// form), this pages through
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
					statusDetail
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
						...Team_team @unmask
					}
					awayTeam {
						...Team_team @unmask
					}
				}
			}
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
