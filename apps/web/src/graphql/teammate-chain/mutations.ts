import type { QueryClient } from "@tanstack/react-query"
import {
	ArcadeViewerGroupsDocument,
	GroupArcadeWeekDocument,
} from "#/graphql/arcade/queries"
import { graphql } from "#/graphql/generated"
import { invalidateOperations } from "#/graphql/query-options"
import {
	AdminTeammateChainScheduleDocument,
	GroupTeammateChainBoardDocument,
	TeammateChainTodayDocument,
	ViewerTeammateChainStatsDocument,
} from "./queries"

// Starts the clock. Pressing it again changes nothing.
export const StartTeammateChainDocument = graphql(`
	mutation StartTeammateChain($puzzleId: ID!) {
		startTeammateChain(puzzleId: $puzzleId) {
			__typename
			... on TeammateChainPlay {
				...TeammateChainPlay_play @unmask
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const AddChainPlayerDocument = graphql(`
	mutation AddChainPlayer($puzzleId: ID!, $playerId: ID!) {
		addChainPlayer(puzzleId: $puzzleId, playerId: $playerId) {
			__typename
			... on TeammateChainPlay {
				...TeammateChainPlay_play @unmask
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

// One more clue about a mystery teammate of the chain's last player.
export const HintTeammateChainDocument = graphql(`
	mutation HintTeammateChain($puzzleId: ID!) {
		hintTeammateChain(puzzleId: $puzzleId) {
			__typename
			... on TeammateChainPlay {
				...TeammateChainPlay_play @unmask
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

export const UndoChainPlayerDocument = graphql(`
	mutation UndoChainPlayer($puzzleId: ID!) {
		undoChainPlayer(puzzleId: $puzzleId) {
			__typename
			... on TeammateChainPlay {
				...TeammateChainPlay_play @unmask
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

export const GiveUpTeammateChainDocument = graphql(`
	mutation GiveUpTeammateChain($puzzleId: ID!) {
		giveUpTeammateChain(puzzleId: $puzzleId) {
			__typename
			... on TeammateChainPlay {
				...TeammateChainPlay_play @unmask
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

export const ImportTeammateChainMovesDocument = graphql(`
	mutation ImportTeammateChainMoves(
		$puzzleId: ID!
		$inputs: [TeammateChainInput!]!
		$startedAt: DateTime!
		$finishedAt: DateTime
	) {
		importTeammateChainMoves(
			puzzleId: $puzzleId
			inputs: $inputs
			startedAt: $startedAt
			finishedAt: $finishedAt
		) {
			__typename
			... on TeammateChainPlay {
				status
			}
		}
	}
`)

// Deletes the admin's own game on today's puzzle.
export const ResetMyTeammateChainPlayDocument = graphql(`
	mutation ResetMyTeammateChainPlay {
		resetMyTeammateChainPlay {
			__typename
		}
	}
`)

export const RerollTeammateChainPuzzleDocument = graphql(`
	mutation RerollTeammateChainPuzzle($date: String!, $leagueId: ID) {
		rerollTeammateChainPuzzle(date: $date, leagueId: $leagueId) {
			__typename
			... on TeammateChainPuzzleAdmin {
				played
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

export const SwapTeammateChainPuzzlesDocument = graphql(`
	mutation SwapTeammateChainPuzzles($date: String!, $otherDate: String!) {
		swapTeammateChainPuzzles(date: $date, otherDate: $otherDate) {
			__typename
			... on TeammateChainPuzzleAdmin {
				played
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

// Everything that shows a player's Teammate Chain games or the schedule.
export function invalidateTeammateChain(queryClient: QueryClient) {
	return invalidateOperations(queryClient, [
		TeammateChainTodayDocument,
		ViewerTeammateChainStatsDocument,
		ArcadeViewerGroupsDocument,
		GroupTeammateChainBoardDocument,
		GroupArcadeWeekDocument,
		AdminTeammateChainScheduleDocument,
	])
}
