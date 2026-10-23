import type { QueryClient } from "@tanstack/react-query"
import {
	ArcadeViewerGroupsDocument,
	GroupArcadeWeekDocument,
} from "#/graphql/arcade/queries"
import { graphql } from "#/graphql/generated"
import { invalidateOperations } from "#/graphql/query-options"
import {
	AdminSeasonScheduleDocument,
	GroupSeasonBoardDocument,
	SeasonPuzzleTodayDocument,
	ViewerSeasonPuzzleStatsDocument,
} from "./queries"

export const GuessSeasonDocument = graphql(`
	mutation GuessSeason($puzzleId: ID!, $teamId: ID!, $year: Int!) {
		guessSeason(puzzleId: $puzzleId, teamId: $teamId, year: $year) {
			__typename
			... on SeasonPuzzlePlay {
				...SeasonPuzzlePlay_play @unmask
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const ImportSeasonGuessesDocument = graphql(`
	mutation ImportSeasonGuesses(
		$puzzleId: ID!
		$guesses: [SeasonPuzzleGuessInput!]!
	) {
		importSeasonGuesses(puzzleId: $puzzleId, guesses: $guesses) {
			__typename
			... on SeasonPuzzlePlay {
				status
			}
		}
	}
`)

// Deletes the admin's own game on today's puzzle.
export const ResetMySeasonPlayDocument = graphql(`
	mutation ResetMySeasonPlay {
		resetMySeasonPlay {
			__typename
		}
	}
`)

export const RerollSeasonPuzzleDocument = graphql(`
	mutation RerollSeasonPuzzle($date: String!, $leagueId: ID) {
		rerollSeasonPuzzle(date: $date, leagueId: $leagueId) {
			__typename
			... on SeasonPuzzleAdmin {
				id
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const SetSeasonPuzzleDocument = graphql(`
	mutation SetSeasonPuzzle($date: String!, $teamId: ID!, $year: Int!) {
		setSeasonPuzzle(date: $date, teamId: $teamId, year: $year) {
			__typename
			... on SeasonPuzzleAdmin {
				id
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const EditSeasonPuzzleCluesDocument = graphql(`
	mutation EditSeasonPuzzleClues($date: String!, $clues: [String!]!) {
		editSeasonPuzzleClues(date: $date, clues: $clues) {
			__typename
			... on SeasonPuzzleAdmin {
				id
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const SwapSeasonPuzzlesDocument = graphql(`
	mutation SwapSeasonPuzzles($date: String!, $otherDate: String!) {
		swapSeasonPuzzles(date: $date, otherDate: $otherDate) {
			__typename
			... on SeasonPuzzleAdmin {
				id
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

// Everything that shows a player's games or the schedule.
export function invalidateSeasonPuzzles(queryClient: QueryClient) {
	return invalidateOperations(queryClient, [
		SeasonPuzzleTodayDocument,
		ViewerSeasonPuzzleStatsDocument,
		ArcadeViewerGroupsDocument,
		GroupSeasonBoardDocument,
		GroupArcadeWeekDocument,
		AdminSeasonScheduleDocument,
	])
}
