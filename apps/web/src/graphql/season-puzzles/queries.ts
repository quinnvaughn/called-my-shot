import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// A franchise's season, the answer and what a guess names.
export const TeamSeasonFragment = graphql(`
	fragment TeamSeason_season on TeamSeason {
		id
		year
		label
		name
		team {
			...Team_team @unmask
		}
	}
`)

// One player's game: what they've guessed, the clues they've earned, and the
// answer once it's over. Spread with @unmask: the game components read it as
// plain props.
export const SeasonPuzzlePlayFragment = graphql(`
	fragment SeasonPuzzlePlay_play on SeasonPuzzlePlay {
		status
		clues
		guessCount
		guesses {
			year
			label
			name
			outcome
			direction
			team {
				...Team_team @unmask
			}
		}
		answer {
			...TeamSeason_season @unmask
		}
	}
`)

export const SeasonPuzzleTodayDocument = graphql(`
	query SeasonPuzzleToday {
		seasonPuzzleToday {
			id
			date
			nextPuzzleAt
			league {
				id
				name
				abbreviation
			}
			viewerPlay {
				...SeasonPuzzlePlay_play @unmask
			}
		}
	}
`)

export const seasonPuzzleTodayQuery = gqlQueryOptions(
	SeasonPuzzleTodayDocument,
	{},
)

// Any scheduled day's puzzle, for an admin's practice game. Admins only.
export const AdminSeasonPuzzleDocument = graphql(`
	query AdminSeasonPuzzle($date: String!) {
		adminSeasonPuzzle(date: $date) {
			__typename
			... on SeasonPuzzle {
				id
				date
				nextPuzzleAt
				league {
					id
					name
					abbreviation
				}
			}
		}
	}
`)

export const adminSeasonPuzzleQuery = (date: string) =>
	gqlQueryOptions(AdminSeasonPuzzleDocument, { date })

export const SeasonPuzzleGuestPlayDocument = graphql(`
	query SeasonPuzzleGuestPlay(
		$puzzleId: ID!
		$guesses: [SeasonPuzzleGuessInput!]!
	) {
		seasonPuzzleGuestPlay(puzzleId: $puzzleId, guesses: $guesses) {
			__typename
			... on SeasonPuzzlePlay {
				...SeasonPuzzlePlay_play @unmask
			}
		}
	}
`)

export type SeasonGuess = { teamId: string; year: number }

export const seasonPuzzleGuestPlayQuery = (
	puzzleId: string,
	guesses: SeasonGuess[],
) => gqlQueryOptions(SeasonPuzzleGuestPlayDocument, { puzzleId, guesses })

// Every franchise in the day's league, with the seasons a guess can name and
// the names it went by in them.
export const SeasonGuessOptionsDocument = graphql(`
	query SeasonGuessOptions($leagueId: ID!) {
		seasonGuessOptions(leagueId: $leagueId) {
			formerNames
			seasons {
				year
				label
			}
			team {
				...Team_team @unmask
			}
		}
	}
`)

export const seasonGuessOptionsQuery = (leagueId: string) =>
	gqlQueryOptions(SeasonGuessOptionsDocument, { leagueId })

export const SeasonPuzzleShareDocument = graphql(`
	query SeasonPuzzleShare(
		$date: String!
		$result: String!
		$by: String!
		$hasBy: Boolean!
	) {
		seasonPuzzleShare(date: $date) {
			date
			league {
				id
				abbreviation
			}
			answer {
				...TeamSeason_season @unmask
			}
			sharer(username: $by, result: $result) @include(if: $hasBy) {
				id
				username
				name
				avatarUrl
			}
		}
	}
`)

// `by` is the username a shared link names; the API returns them as the
// sharer only if the link's squares are their real result.
export const seasonPuzzleShareQuery = (
	date: string,
	result: string,
	by: string | undefined,
) =>
	gqlQueryOptions(SeasonPuzzleShareDocument, {
		date,
		result,
		by: by ?? "",
		hasBy: !!by,
	})

export const ViewerSeasonPuzzleStatsDocument = graphql(`
	query ViewerSeasonPuzzleStats {
		viewerSeasonPuzzleStats {
			played
			solved
			missed
			distribution
			currentStreak
			bestStreak
		}
	}
`)

export const viewerSeasonPuzzleStatsQuery = gqlQueryOptions(
	ViewerSeasonPuzzleStatsDocument,
	{},
)

export const SeasonPuzzleAdminFragment = graphql(`
	fragment SeasonPuzzleAdmin_puzzle on SeasonPuzzleAdmin {
		id
		date
		clues
		played
		answer {
			...TeamSeason_season @unmask
			team {
				id
				league {
					id
				}
			}
		}
	}
`)

export const AdminSeasonScheduleDocument = graphql(`
	query AdminSeasonSchedule($days: Int) {
		adminSeasonSchedule(days: $days) {
			__typename
			... on QueryAdminSeasonScheduleSuccess {
				data {
					days {
						date
						puzzle {
							...SeasonPuzzleAdmin_puzzle @unmask
						}
					}
					pool {
						ready
						league {
							id
							abbreviation
						}
					}
				}
			}
		}
	}
`)

export const adminSeasonScheduleQuery = gqlQueryOptions(
	AdminSeasonScheduleDocument,
	{ days: 30 },
)

export const GroupSeasonBoardDocument = graphql(`
	query GroupSeasonBoard($groupId: ID!) {
		group(id: $groupId) {
			id
			seasonPuzzleBoard {
				date
				today {
					status
					squares
					user {
						id
						username
						name
						avatarUrl
					}
				}
			}
		}
	}
`)

export const groupSeasonBoardQuery = (groupId: string) =>
	gqlQueryOptions(GroupSeasonBoardDocument, { groupId })
