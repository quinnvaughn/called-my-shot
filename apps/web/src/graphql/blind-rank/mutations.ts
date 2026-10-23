import type { QueryClient } from "@tanstack/react-query"
import {
	ArcadeViewerGroupsDocument,
	GroupArcadeWeekDocument,
} from "#/graphql/arcade/queries"
import { graphql } from "#/graphql/generated"
import { invalidateOperations } from "#/graphql/query-options"
import {
	AdminRankScheduleDocument,
	GroupRankBoardDocument,
	RankPuzzleTodayDocument,
	ViewerRankStatsDocument,
} from "./queries"

// `slot` is 1-based: 1 is the most.
export const PlaceRankDocument = graphql(`
	mutation PlaceRank($puzzleId: ID!, $slot: Int!) {
		placeRank(puzzleId: $puzzleId, slot: $slot) {
			__typename
			... on RankPlay {
				...RankPlay_play @unmask
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

export const ImportRankPlacementsDocument = graphql(`
	mutation ImportRankPlacements($puzzleId: ID!, $placements: [Int!]!) {
		importRankPlacements(puzzleId: $puzzleId, placements: $placements) {
			__typename
			... on RankPlay {
				status
			}
		}
	}
`)

// Deletes the admin's own game on today's puzzle.
export const ResetMyRankPlayDocument = graphql(`
	mutation ResetMyRankPlay {
		resetMyRankPlay {
			__typename
		}
	}
`)

export const RerollRankPuzzleDocument = graphql(`
	mutation RerollRankPuzzle(
		$date: String!
		$kind: RankPuzzleKind
		$leagueId: ID
	) {
		rerollRankPuzzle(date: $date, kind: $kind, leagueId: $leagueId) {
			__typename
			... on RankPuzzleAdmin {
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

export const EditRankPromptDocument = graphql(`
	mutation EditRankPrompt($date: String!, $prompt: String!, $context: String!) {
		editRankPrompt(date: $date, prompt: $prompt, context: $context) {
			__typename
			... on RankPuzzleAdmin {
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

export const SwapRankPuzzlesDocument = graphql(`
	mutation SwapRankPuzzles($date: String!, $otherDate: String!) {
		swapRankPuzzles(date: $date, otherDate: $otherDate) {
			__typename
			... on RankPuzzleAdmin {
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

// Everything that shows a player's Blind Rank games or the schedule.
export function invalidateRankPuzzles(queryClient: QueryClient) {
	return invalidateOperations(queryClient, [
		RankPuzzleTodayDocument,
		ViewerRankStatsDocument,
		ArcadeViewerGroupsDocument,
		GroupRankBoardDocument,
		GroupArcadeWeekDocument,
		AdminRankScheduleDocument,
	])
}
