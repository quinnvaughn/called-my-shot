import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { useGqlMutation } from "#/graphql/hooks"
import {
	ImportTeammateChainMovesDocument,
	invalidateTeammateChain,
} from "#/graphql/teammate-chain/mutations"
import { takeGuestChainGame } from "#/stores/teammate-chain-store"

// Saves the Teammate Chain game a player played before signing up, as soon
// as there's an account to save it to, on whatever page signing up landed
// on. The API only takes today's, and only onto an account with no game on
// it.
export function useImportTeammateChain(viewerId: string | null) {
	const queryClient = useQueryClient()
	const importMoves = useGqlMutation(ImportTeammateChainMovesDocument)

	// biome-ignore lint/correctness/useExhaustiveDependencies: once per viewer
	useEffect(() => {
		if (!viewerId) return
		const game = takeGuestChainGame()
		if (!game?.startedAt) return
		void importMoves
			.mutateAsync({
				puzzleId: game.puzzleId,
				inputs: game.inputs,
				startedAt: game.startedAt,
				finishedAt: game.finishedAt,
			})
			.then(() => invalidateTeammateChain(queryClient))
			.catch(() => {})
	}, [viewerId])
}
