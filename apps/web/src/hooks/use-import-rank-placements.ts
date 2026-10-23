import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import {
	ImportRankPlacementsDocument,
	invalidateRankPuzzles,
} from "#/graphql/blind-rank/mutations"
import { useGqlMutation } from "#/graphql/hooks"
import { takeGuestRankGame } from "#/stores/rank-puzzle-store"

// Saves the Blind Rank game a player played before signing up, as soon as
// there's an account to save it to, on whatever page signing up landed on.
// The API only takes today's, and only onto an account with no game on it.
export function useImportRankPlacements(viewerId: string | null) {
	const queryClient = useQueryClient()
	const importPlacements = useGqlMutation(ImportRankPlacementsDocument)

	// biome-ignore lint/correctness/useExhaustiveDependencies: once per viewer
	useEffect(() => {
		if (!viewerId) return
		const game = takeGuestRankGame()
		if (!game) return
		void importPlacements
			.mutateAsync({ puzzleId: game.puzzleId, placements: game.placements })
			.then(() => invalidateRankPuzzles(queryClient))
			.catch(() => {})
	}, [viewerId])
}
